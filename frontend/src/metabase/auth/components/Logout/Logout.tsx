import React, { useEffect } from "react";

interface LogoutProps {
  onLogout: () => void;
}

const Logout = ({ onLogout }: LogoutProps): JSX.Element | null => {
  useEffect(() => {
    onLogout();
  }, [onLogout]);
  return null;
};

export default Logout;
