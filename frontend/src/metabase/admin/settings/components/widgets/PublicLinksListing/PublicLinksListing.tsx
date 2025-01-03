import cx from "classnames";
import { t } from "ttag";

import Confirm from "metabase/components/Confirm";
import LoadingAndErrorWrapper from "metabase/components/LoadingAndErrorWrapper";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Icon, Loader } from "metabase/ui";

export const PublicLinksListing = <
  T extends { id: string | number; name: string },
>({
  isLoading,
  data = [],
  revoke,
  getUrl,
  getPublicUrl,
  noLinksMessage,
  "data-testid": dataTestId,
}: {
  data?: T[];
  isLoading: boolean;
  revoke?: (item: T) => Promise<unknown>;
  getUrl: (item: T) => string;
  getPublicUrl?: (item: T) => string | null;
  noLinksMessage: string;
  "data-testid"?: string;
}) => {
  if (isLoading) {
    return <Loader />;
  }

  if (data.length === 0) {
    return <LoadingAndErrorWrapper error={noLinksMessage} />;
  }

  return (
    <table data-testid={dataTestId} className={AdminS.ContentTable}>
      <thead>
        <tr>
          <th>{t`Name`}</th>
          {getPublicUrl && <th>{t`Public Link`}</th>}
          {revoke && <th>{t`Revoke Link`}</th>}
        </tr>
      </thead>
      <tbody>
        {data.map(item => {
          const internalUrl = getUrl?.(item);
          const publicUrl = getPublicUrl?.(item);

          return (
            <tr key={item.id}>
              <td>
                {internalUrl ? (
                  <Link to={internalUrl} className={CS.textWrap}>
                    {item.name}
                  </Link>
                ) : (
                  item.name
                )}
              </td>
              {publicUrl && (
                <td>
                  <ExternalLink
                    href={publicUrl}
                    className={cx(CS.link, CS.textWrap)}
                  >
                    {publicUrl}
                  </ExternalLink>
                </td>
              )}
              {revoke && (
                <td className={cx(CS.flex, CS.layoutCentered)}>
                  <Confirm
                    title={t`Disable this link?`}
                    content={t`They won't work anymore, and can't be restored, but you can create new links.`}
                    action={async () => {
                      await revoke(item);
                    }}
                  >
                    <ActionIcon aria-label={t`Revoke link`}>
                      <Icon name="close" />
                    </ActionIcon>
                  </Confirm>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
};
