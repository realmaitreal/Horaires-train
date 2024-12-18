import React from 'react';
import { Train } from 'lucide-react';

const LineIcon = ({ 
  name, 
  code,
  backgroundColor,
  textColor,
  size = 32 
}) => {
  // On essaie d'abord d'utiliser name, sinon on utilise code
  const displayText = name || code;
  
  if (displayText) {
    return (
      <div 
        className="relative inline-flex items-center justify-center font-bold rounded-md px-3"
        style={{ 
          backgroundColor: backgroundColor ? `#${backgroundColor}` : '#FFFFFF',
          color: textColor ? `#${textColor}` : '#000000',
          height: size,
          fontSize: Math.floor(size * 0.5),
          border: !backgroundColor ? '1px solid #E5E7EB' : 'none',
          whiteSpace: 'nowrap',
        }}
      >
        {displayText}
      </div>
    );
  }

  return (
    <div className="w-8 h-8 flex items-center justify-center bg-gray-200 rounded-md">
      <Train className="w-5 h-5 text-gray-600" />
    </div>
  );
};

export default LineIcon;