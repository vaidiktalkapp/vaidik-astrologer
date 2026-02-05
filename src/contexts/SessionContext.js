import React, { createContext, useState, useContext } from 'react';

const SessionContext = createContext();

export const SessionProvider = ({ children }) => {
  const [activeSession, setActiveSession] = useState(null); // { type: 'chat' | 'call', params: {} }

  // Logic to restore session on app launch has been removed.
  // This ensures that if the app process is killed, the ghost session is cleared.
  const startSession = async (type, params) => {
    const session = { type, params };
    setActiveSession(session);
  };

  const endSession = async () => {
    setActiveSession(null);
  };

  return (
    <SessionContext.Provider value={{ activeSession, startSession, endSession }}>
      {children}
    </SessionContext.Provider>
  );
};

export const useSession = () => useContext(SessionContext);