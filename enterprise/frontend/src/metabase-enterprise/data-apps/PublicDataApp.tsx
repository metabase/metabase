/* eslint-disable i18next/no-literal-string */

export const PublicDataApp = ({
  params: { appUrl },
}: {
  params: { appUrl: string };
}) => {
  return <div>DATA APP {appUrl}</div>;
};
