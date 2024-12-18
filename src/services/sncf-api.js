// Constantes API
const API_KEY = 'f7fc30fd-5742-40f9-95f0-ecf3a4a6bf0b';
const BASE_URL = 'https://api.sncf.com/v1/coverage/sncf';

// Configuration par défaut pour fetch
const fetchConfig = {
  headers: {
    'Authorization': `Basic ${btoa(API_KEY + ':')}`
  },
};

// Fonction pour formater la date pour l'API SNCF
const formatSNCFDate = (date = new Date()) => {
  const pad = (num) => String(num).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
};

// Fonction pour parser une date SNCF
const parseSNCFDate = (dateStr) => {
  if (!dateStr) return null;
  try {
    const year = dateStr.slice(0, 4);
    const month = parseInt(dateStr.slice(4, 6)) - 1;
    const day = dateStr.slice(6, 8);
    const hour = dateStr.slice(9, 11);
    const minute = dateStr.slice(11, 13);
    const second = dateStr.slice(13, 15);
    return new Date(year, month, day, hour, minute, second);
  } catch {
    return null;
  }
};

// Fonction pour parser les heures au format HHMMSS
const parseTime = (timeStr, baseDate) => {
  if (!timeStr || !baseDate) return null;
  const hours = parseInt(timeStr.substring(0, 2));
  const minutes = parseInt(timeStr.substring(2, 4));
  const seconds = parseInt(timeStr.substring(4, 6));
  
  const result = new Date(baseDate);
  result.setHours(hours, minutes, seconds);
  return result;
};

export const sncfAPI = {
  // Recherche de gares
  searchStations: async (query) => {
    try {
      const response = await fetch(
        `${BASE_URL}/places?q=${encodeURIComponent(query)}&type=stop_area&count=10`,
        fetchConfig
      );
      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();
      return data.places
        .filter(place => place.embedded_type === 'stop_area')
        .map(place => ({
          id: place.id,
          name: place.name,
          coord: place.stop_area.coord
        }));
    } catch (error) {
      console.error('Erreur lors de la recherche des gares:', error);
      throw error;
    }
  },

  // Récupération des départs
  getDepartures: async (stationId) => {
    try {
      const response = await fetch(
        `${BASE_URL}/stop_areas/${stationId}/departures?datetime=${formatSNCFDate()}&data_freshness=realtime&count=20&depth=3`,
        fetchConfig
      );
      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();
      
      return data.departures.map((dep, index) => {
        const display_info = dep.display_informations;
        const baseDateTime = dep.stop_date_time.base_departure_date_time;
        const realDateTime = dep.stop_date_time.departure_date_time;
        
        const baseDate = parseSNCFDate(baseDateTime);
        const realDate = parseSNCFDate(realDateTime);

        const platform = dep.stop_point.platform_code || dep.stop_point.platform || '';

        return {
          id: `${display_info.headsign}_${index}`,
          trainNumber: display_info.headsign,
          destination: display_info.direction,
          platform: platform || 'N/A',
          scheduledTime: baseDate,
          realTime: realDate,
          delay: Math.round((realDate - baseDate) / 60000),
          type: display_info.commercial_mode,
          network: display_info.network,
          disruptions: dep.disruptions || [],
          route: dep.route,
          stopAreaId: dep.stop_point.stop_area.id,
          links: dep.links,
          vehicleJourneyId: dep.links.find(link => link.type === "vehicle_journey")?.id,
          display_informations: display_info
        };
      });
    } catch (error) {
      console.error('Erreur lors de la récupération des départs:', error);
      throw error;
    }
  },

  // Récupération du détail d'un trajet
  getJourneyDetails: async (departure) => {
    try {
      console.log('Récupération des détails pour le trajet:', departure);
      
      const vehicleJourneyId = departure.links?.find(link => 
        link.type === "vehicle_journey"
      )?.id;

      if (!vehicleJourneyId) {
        console.error('Pas de vehicle_journey_id trouvé dans:', departure.links);
        throw new Error('Impossible de trouver l\'identifiant du trajet');
      }

      const url = `${BASE_URL}/vehicle_journeys/${encodeURIComponent(vehicleJourneyId)}` +
                 `?data_freshness=realtime`;
      
      console.log('URL de requête:', url);
      
      const response = await fetch(url, {
        ...fetchConfig,
        headers: {
          ...fetchConfig.headers,
          'Accept': 'application/json'
        }
      });
      
      if (!response.ok) {
        console.error('Erreur de réponse:', response.status, response.statusText);
        throw new Error('Erreur réseau lors de la récupération du trajet');
      }
      
      const data = await response.json();
      console.log('Données reçues:', data);

      const vehicleJourney = data.vehicle_journeys?.[0];
      if (!vehicleJourney?.stop_times) {
        console.error('Pas d\'arrêts trouvés dans la réponse');
        return [];
      }

      // On prend la date du jour pour base
      const baseDate = new Date(departure.scheduledTime);
      baseDate.setHours(0, 0, 0, 0);

      // On traite les arrêts
      const stops = vehicleJourney.stop_times
        .map((stop, index) => {
          const arrivalTime = parseTime(stop.arrival_time, baseDate);
          const departureTime = parseTime(stop.departure_time || stop.arrival_time, baseDate);
          const baseArrivalTime = parseTime(stop.base_arrival_time, baseDate);
          const baseDepartureTime = parseTime(stop.base_departure_time || stop.base_arrival_time, baseDate);
          
          if (!arrivalTime || !departureTime) return null;

          const platform = stop.stop_point?.platform_code || 
                         stop.stop_point?.platform || 
                         '';

          // Calcul des retards
          const arrivalDelay = baseArrivalTime ? 
            Math.round((arrivalTime.getTime() - baseArrivalTime.getTime()) / 60000) : 0;
          const departureDelay = baseDepartureTime ? 
            Math.round((departureTime.getTime() - baseDepartureTime.getTime()) / 60000) : 0;

          return {
            id: `${departure.trainNumber}_${index}`,
            station: stop.stop_point.label || stop.stop_point.name,
            arrivalTime,
            departureTime,
            baseArrivalTime,
            baseDepartureTime,
            platform: platform || 'N/A',
            arrivalDelay,
            departureDelay,
            status: stop.pickup_allowed === false ? 'terminus' : 
                   stop.drop_off_allowed === false ? 'origine' : 'standard'
          };
        })
        .filter(stop => stop !== null);

      console.log('Arrêts traités:', stops);
      
      return stops.sort((a, b) => a.arrivalTime.getTime() - b.arrivalTime.getTime());

    } catch (error) {
      console.error('Erreur lors de la récupération des détails:', error);
      throw error;
    }
  },

  // Récupération des infos trafic
  getLineReports: async () => {
    try {
      // Utilisez l'endpoint disruptions directement pour avoir toutes les perturbations
      const response = await fetch(
        `${BASE_URL}/disruptions?count=50&depth=3`,
        fetchConfig
      );
      
      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();
      
      console.log('Disruptions response:', data); // Pour debug
      
      // Si les données sont dans un format différent, adaptez ici
      return {
        disruptions: data.disruptions?.map(disruption => ({
          id: disruption.id,
          status: disruption.status,
          severity: {
            name: disruption.severity?.name,
            effect: disruption.severity?.effect,
            color: disruption.severity?.color
          },
          messages: disruption.messages?.map(msg => ({
            text: msg.text,
            channel: msg.channel
          })),
          impacted_objects: disruption.impacted_objects?.map(obj => ({
            pt_object: {
              id: obj.pt_object?.id,
              name: obj.pt_object?.name,
              type: obj.pt_object?.embedded_type
            }
          })),
          application_periods: disruption.application_periods
        }))
      };
    } catch (error) {
      console.error('Erreur lors de la récupération des infos trafic:', error);
      throw error;
    }
  },

  // Ajoutez une nouvelle méthode pour faciliter la recherche des perturbations par ligne
  getDisruptionsForLine: (lineId, disruptions) => {
    if (!disruptions?.disruptions || !lineId) return null;

    return disruptions.disruptions.filter(disruption => 
      disruption.impacted_objects?.some(obj => 
        obj.pt_object?.id === lineId || 
        obj.pt_object?.id?.includes(lineId)
      )
    );
  },

  // Récupération des infos équipements
  getEquipmentReports: async () => {
    try {
      const response = await fetch(
        `${BASE_URL}/equipment_reports?count=50&depth=3`,
        fetchConfig
      );
      
      if (!response.ok) throw new Error('Erreur réseau');
      const data = await response.json();
      
      console.log('Equipment reports response:', data);
      
      return data.equipment_reports;
    } catch (error) {
      console.error('Erreur lors de la récupération des infos équipements:', error);
      throw error;
    }
  }
}