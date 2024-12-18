import { useState, useEffect, useCallback, useRef } from 'react';
import PropTypes from 'prop-types';
import { Search, Train, Bus, Clock, AlertTriangle, AlertCircle, MapPin, Info, ArrowDownWideNarrow, ArrowUpWideNarrow } from 'lucide-react';
import debounce from 'lodash/debounce';
import { sncfAPI } from './services/sncf-api';
import LineIcon from './components/LineIcon';

// Composant pour le texte défilant
const ScrollingText = ({ text, className }) => {
  const [shouldScroll, setShouldScroll] = useState(false);
  const textRef = useRef(null);

  useEffect(() => {
    if (textRef.current) {
      const { offsetWidth, scrollWidth } = textRef.current;
      setShouldScroll(scrollWidth > offsetWidth);
    }
  }, [text]);

  const scrollingClass = shouldScroll ? 
    'animate-scrolling whitespace-nowrap' : 
    'truncate';

  return (
    <div className="overflow-hidden">
      <div
        ref={textRef}
        className={`${scrollingClass} ${className || ''}`}
        style={shouldScroll ? {
          animation: 'scrolling 15s linear infinite',
          paddingRight: '50px' // Espace entre la fin et le début du texte
        } : {}}
      >
        {shouldScroll ? `${text}     ${text}` : text}
      </div>
    </div>
  );
};

ScrollingText.propTypes = {
  text: PropTypes.string.isRequired,
  className: PropTypes.string
};

ScrollingText.defaultProps = {
  className: ''
};

const formatTime = (date) => {
  if (!date || isNaN(date)) {
    return '--:--';
  }
  
  // Si c'est déjà un objet Date valide
  if (date instanceof Date && !isNaN(date)) {
    return new Intl.DateTimeFormat('fr-FR', {
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  }
  
  return '--:--';
};

const calculateDelay = (realTime, scheduledTime) => {
  if (!realTime || !scheduledTime) return null;
  if (!(realTime instanceof Date) || !(scheduledTime instanceof Date)) return null;
  if (isNaN(realTime.getTime()) || isNaN(scheduledTime.getTime())) return null;
  
  return Math.round((realTime - scheduledTime) / 60000);
};

const SNCFApp = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [stations, setStations] = useState([]);
  const [selectedStation, setSelectedStation] = useState(null);
  const [departures, setDepartures] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedDeparture, setSelectedDeparture] = useState(null);
  const [journeyDetails, setJourneyDetails] = useState(null);
  const [trafficInfo, setTrafficInfo] = useState(null);
  const [equipmentInfo, setEquipmentInfo] = useState(null);

  // Recherche de gares avec debounce
  const searchStations = useCallback(
    debounce(async (query) => {
      if (query.length < 2) return;
      setLoading(true);
      try {
        const results = await sncfAPI.searchStations(query);
        setStations(results);
        setError(null);
      } catch (_err) {
        setError('Erreur lors de la recherche des gares.');
        setStations([]);
      }
      setLoading(false);
    }, 300),
    []
  );

  // Chargement des départs
  const loadDepartures = async (station) => {
    setLoading(true);
    try {
      const results = await sncfAPI.getDepartures(station.id);
      setDepartures(results);
      setError(null);
    } catch (_err) {
      setError('Erreur lors du chargement des départs.');
      setDepartures([]);
    }
    setLoading(false);
  };

  // Chargement des détails d'un trajet
  const loadJourneyDetails = async (departure) => {
    try {
      const details = await sncfAPI.getJourneyDetails(departure);
      setJourneyDetails(details);
    } catch (_err) {
      setError('Erreur lors du chargement des détails du trajet.');
    }
  };

  // Chargement des infos trafic
  const loadTrafficInfo = async () => {
    try {
      const data = await sncfAPI.getLineReports();
      setTrafficInfo(data);
    } catch (_err) {
      console.error('Erreur lors de la récupération des infos trafic:', _err);
    }
  };

  // Chargement des infos équipements
  const loadEquipmentInfo = async () => {
    try {
      const data = await sncfAPI.getEquipmentReports();
      setEquipmentInfo(data);
    } catch (_err) {
      console.error('Erreur lors de la récupération des infos équipements:', _err);
    }
  };

  // Effet pour la recherche
  useEffect(() => {
    if (searchQuery) {
      searchStations(searchQuery);
    } else {
      setStations([]);
    }
  }, [searchQuery, searchStations]);

  // Effet pour le chargement des départs
  useEffect(() => {
    if (selectedStation) {
      loadDepartures(selectedStation);
    }
  }, [selectedStation]);

  // Effet pour le chargement initial des infos trafic et équipements
  useEffect(() => {
    loadTrafficInfo();
    loadEquipmentInfo();
    // Rafraîchir toutes les 5 minutes
    const trafficInterval = setInterval(loadTrafficInfo, 5 * 60 * 1000);
    const equipmentInterval = setInterval(loadEquipmentInfo, 5 * 60 * 1000);
    return () => {
      clearInterval(trafficInterval);
      clearInterval(equipmentInterval);
    };
  }, []);

  // Fonction pour trouver les perturbations d'une ligne
  const getLineDisruptions = (lineId) => {
    if (!trafficInfo || !lineId) return null;
    return sncfAPI.getDisruptionsForLine(lineId, trafficInfo);
  };

  // Fonction pour obtenir les équipements par gare
  const getEquipmentForStation = (stationId) => {
    if (!equipmentInfo) return null;
    
    return equipmentInfo.find(report => 
      report.stop_area_equipments?.some(
        equipment => equipment.stop_area.id === stationId
      )
    )?.stop_area_equipments.find(
      equipment => equipment.stop_area.id === stationId
    );
  };

  return (
    <div className="max-w-4xl mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6 text-blue-600">Départs des Trains</h1>
      
      {/* Barre de recherche */}
      <div className="relative mb-6">
        <div className="relative">
          <input
            type="text"
            placeholder="Rechercher une gare..."
            className="w-full p-4 pl-12 border rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Rechercher une gare"
          />
          <Search className="absolute left-4 top-4 text-gray-400" />
        </div>

        {/* Liste des suggestions */}
        {stations.length > 0 && (
          <div className="absolute z-10 w-full mt-1 bg-white border rounded-lg shadow-lg">
            {stations.map((station) => (
              <button
                key={station.id}
                className="w-full p-3 text-left hover:bg-gray-100 flex items-center space-x-2"
                onClick={() => {
                  setSelectedStation(station);
                  setSearchQuery(station.name);
                  setStations([]);
                }}
              >
                <MapPin className="text-gray-400" size={16} />
                <span>{station.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Message d'erreur */}
      {error && (
        <div className="p-4 mb-4 text-red-700 bg-red-100 rounded-lg">
          <AlertTriangle className="inline-block h-4 w-4 mr-2" />
          <span>{error}</span>
        </div>
      )}

      {/* Indicateur de chargement */}
      {loading && (
        <div className="flex justify-center my-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}

      {/* Station sélectionnée */}
      {selectedStation && (
        <div className="mb-6">
          <h2 className="text-xl font-semibold flex items-center space-x-2">
            <MapPin className="text-blue-600" />
            <span>{selectedStation.name}</span>
          </h2>
        </div>
      )}

      {/* Liste des départs */}
      <div className="space-y-4">
        {departures.map((departure) => {
          const lineDisruptions = getLineDisruptions(departure.route?.line?.id);
          const isAdditionalService = departure.type === "additional service";
          const delay = calculateDelay(departure.realTime, departure.scheduledTime);
          
          return (
            <div
              key={departure.id}
              className="p-4 border rounded-lg hover:shadow-md cursor-pointer transition-shadow"
              onClick={() => {
                setSelectedDeparture(departure);
                loadJourneyDetails(departure);
              }}
              role="button"
              tabIndex={0}
            >
              <div className="flex items-center gap-4">
                {/* LineIcon sans contrainte de largeur */}
                <div className="flex-shrink-0">
                  <LineIcon 
                    name={isAdditionalService ? "Service de substitution" : departure.route?.line?.name || departure.route?.name}
                    backgroundColor={departure.route?.line?.color || departure.route?.color}
                    textColor={departure.route?.line?.text_color}
                    code={departure.route?.line?.code || departure.route?.code}
                    size={32}
                  />
                </div>
                
                {/* Zone de texte avec défilement automatique */}
                <div className="min-w-0 flex-1">
                  <ScrollingText 
                    text={departure.trainNumber}
                    className="font-semibold text-base leading-tight"
                  />
                  <ScrollingText 
                    text={departure.destination}
                    className="text-gray-600 leading-tight"
                  />
                </div>
                
                {/* Heure et voie toujours visibles */}
                <div className="flex-shrink-0 text-right">
                  <div className="flex items-center justify-end space-x-2">
                    <Clock className="h-4 w-4 text-gray-400" />
                    <span className={delay && delay > 0 ? 'text-red-600' : 'text-green-600'}>
                      {formatTime(departure.realTime)}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500">
                    Voie {departure.platform}
                  </p>
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2">
                {delay && delay > 0 && (
                  <div className="text-sm text-red-600">
                    Retard: {delay} min
                  </div>
                )}
                {departure.network && Number(departure.network) !== 0 && (
                  <div className="text-sm text-gray-500 flex items-center">
                    {isAdditionalService ? (
                      <Bus className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    ) : (
                      <Train className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    )}
                    <span>Réseau {departure.network}</span>
                  </div>
                )}
                {isAdditionalService && (
                  <div className="text-sm text-orange-600 flex items-center">
                    <AlertCircle className="h-3.5 w-3.5 mr-1" aria-hidden="true" />
                    Service de substitution
                  </div>
                )}
              </div>
              
              {/* Affichage des infos trafic */}
              {lineDisruptions && lineDisruptions.length > 0 && lineDisruptions.map(disruption => (
                <div key={disruption.id} 
                    className="mt-2 text-sm flex items-start space-x-1"
                    style={{ color: disruption.severity?.color || '#f97316' }}
                >
                  <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <div className="font-medium">{disruption.severity?.name}</div>
                    <div>{disruption.messages?.[0]?.text || "Perturbations en cours"}</div>
                  </div>
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* Modal des détails */}
      {selectedDeparture && journeyDetails && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setSelectedDeparture(null);
              setJourneyDetails(null);
            }
          }}
        >
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-start mb-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <LineIcon 
                    name={selectedDeparture.type === "additional service" ? "Service de substitution" : selectedDeparture.route?.line?.name || selectedDeparture.route?.name}
                    backgroundColor={selectedDeparture.route?.line?.color || selectedDeparture.route?.color}
                    textColor={selectedDeparture.route?.line?.text_color}
                    code={selectedDeparture.route?.line?.code || selectedDeparture.route?.code}
                    size={40}
                  />
                  <div>
                    <h2 className="text-2xl font-bold">
                      <ScrollingText text={selectedDeparture.trainNumber} />
                    </h2>
                    <h3 className="text-lg text-gray-600">
                      <ScrollingText text={`Direction : ${selectedDeparture.destination}`} />
                    </h3>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 mt-1">
                  {selectedDeparture.network && Number(selectedDeparture.network) !== 0 && (
                    <div className="flex items-center text-gray-500">
                      {selectedDeparture.type === "additional service" ? (
                        <Bus className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      ) : (
                        <Train className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      )}
                      <span>Réseau {selectedDeparture.network}</span>
                    </div>
                  )}
                  {selectedDeparture.type === "additional service" && (
                    <div className="flex items-center text-orange-600">
                      <AlertCircle className="h-4 w-4 mr-1.5" aria-hidden="true" />
                      <span>Service de substitution</span>
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => {
                  setSelectedDeparture(null);
                  setJourneyDetails(null);
                }}
                className="p-2 hover:bg-gray-100 rounded-full flex-shrink-0 ml-4"
                aria-label="Fermer"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Infos trafic détaillées */}
            {getLineDisruptions(selectedDeparture.route?.line?.id)?.map(disruption => (
              <div key={disruption.id} className="mb-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <h4 className="font-semibold text-orange-800 flex items-center">
                  <Info className="h-4 w-4 mr-2" />
                  Information trafic
                </h4>
                {disruption.messages?.map((message, index) => (
                  <div key={index} className="mt-2 text-orange-700 text-sm">
                    {message.text}
                    {message.channel?.content_type === 'text/markdown' && (
                      <div className="mt-1 text-orange-600">
                        {message.channel.types?.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ))}

            {/* Infos équipements */}
            {journeyDetails.map((stop) => {
              const stationEquipments = getEquipmentForStation(stop.id);
              if (!stationEquipments?.equipment_details?.length) return null;

              return (
                <div key={`equipment-${stop.id}`} className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                  <h4 className="font-semibold text-blue-800 flex items-center">
                    <Elevator className="h-4 w-4 mr-2" />
                    État des équipements - {stop.station}
                  </h4>
                  {stationEquipments.equipment_details.map((equipment, idx) => (
                    <div key={idx} className="mt-2 flex items-start gap-2">
                      {equipment.embedded_type === 'escalator' ? (
                        <Escalator className="h-4 w-4 flex-shrink-0 mt-1" />
                      ) : (
                        <Elevator className="h-4 w-4 flex-shrink-0 mt-1" />
                      )}
                      <div>
                        <div className="font-medium">{equipment.name}</div>
                        {equipment.current_availability && (
                          <div className={`text-sm ${
                            equipment.current_availability.status === 'available' 
                              ? 'text-green-600' 
                              : 'text-red-600'
                          }`}>
                            {equipment.current_availability.effect?.label || 
                             equipment.current_availability.status === 'available'
                               ? 'Disponible'
                               : 'Non disponible'}
                            {equipment.current_availability.cause?.label && (
                              <div className="text-gray-600">
                                Cause : {equipment.current_availability.cause.label}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              );
            })}
            
            {/* Zone scrollable pour les arrêts */}
            <div className="flex-1 overflow-y-auto pr-4">
              <div className="space-y-0 relative">
                {/* Ligne verticale de progression */}
                <div className="absolute left-[11px] top-4 bottom-4 w-0.5 bg-gray-200">
                  <div 
                    className="absolute top-0 w-0.5 h-full animate-[progress_30s_ease-out]"
                    style={{ 
                      backgroundColor: selectedDeparture.route?.line?.color 
                      ? `#${selectedDeparture.route.line.color}`
                      : '#3B82F6'
                    }}
                  />
                </div>
                
                {journeyDetails.map((stop, index) => (
                  <div
                    key={stop.id}
                    className="relative flex items-start justify-between py-4 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start space-x-3">
                      <div className="relative z-10 mt-2">
                        <div
                          className={`w-[14px] h-[14px] rounded-full shadow-sm flex items-center justify-center`}
                          style={{
                            backgroundColor: stop.status === 'origine' ? '#22C55E' :
                                          stop.status === 'terminus' ? '#EF4444' :
                                          selectedDeparture.route?.line?.color 
                                            ? `#${selectedDeparture.route.line.color}`
                                            : '#3B82F6'
                          }}
                        >
                          {(stop.status === 'origine' || stop.status === 'terminus') && (
                            <div className="w-[6px] h-[6px] bg-white rounded-full"/>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col flex-1 min-w-0">
                        <ScrollingText 
                          text={stop.station}
                          className="font-medium text-base"
                        />
                        {stop.platform && (
                          <span className="text-sm text-gray-500 mt-0.5">
                            Voie {stop.platform}
                          </span>
                        )}
                        <div className="flex gap-4 mt-2 text-sm">
                          <div className="flex-1">
                            <div className="text-gray-500">Arrivée</div>
                            <div className="font-mono">
                              {formatTime(stop.arrivalTime)}
                              {stop.arrivalDelay > 0 && (
                                <span className="text-red-500 ml-2">
                                  +{stop.arrivalDelay}min
                                </span>
                              )}
                              {stop.arrivalDelay < 0 && (
                                <span className="text-green-500 ml-2">
                                  {stop.arrivalDelay}min
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex-1">
                            <div className="text-gray-500">Départ</div>
                            <div className="font-mono">
                              {formatTime(stop.departureTime)}
                              {stop.departureDelay > 0 && (
                                <span className="text-red-500 ml-2">
                                  +{stop.departureDelay}min
                                </span>
                              )}
                              {stop.departureDelay < 0 && (
                                <span className="text-green-500 ml-2">
                                  {stop.departureDelay}min
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SNCFApp;