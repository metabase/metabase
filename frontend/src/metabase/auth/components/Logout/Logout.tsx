import { useEffect } from "react";

interface LogoutProps {
  onLogout: () => void;
}

const Logout = ({ onLogout }: LogoutProps): JSX.Element | null => {
  useEffect(() => {
    onLogout();
  }, [onLogout]);
  return null;
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default Logout;
