/* eslint-disable i18next/no-literal-string */

import { useGetPublicDataAppQuery } from "metabase/api";

export const PublicDataApp = ({
  params: { appUrl },
}: {
  params: { appUrl: string };
}) => {
  const { data: dataApp } = useGetPublicDataAppQuery({ slug: appUrl });

  return (
    <div>
      <div>DATA APP {appUrl}</div>

      <code>{JSON.stringify(dataApp, null, 4)}</code>
    </div>
  );
};
