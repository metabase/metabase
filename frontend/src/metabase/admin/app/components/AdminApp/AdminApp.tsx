import DeprecationNotice from "../../containers/DeprecationNotice";

export interface AdminAppProps {
  children?: React.ReactNode;
}

const AdminApp = ({ children }: AdminAppProps): JSX.Element => {
  return (
    <>
      <DeprecationNotice />
      {children}
    </>
  );
};

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default AdminApp;
