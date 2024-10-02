import cx from "classnames";
import { t } from "ttag";

import Confirm from "metabase/components/Confirm";
import ExternalLink from "metabase/core/components/ExternalLink";
import Link from "metabase/core/components/Link";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { Icon, Loader } from "metabase/ui";

import { RevokeIconWrapper } from "./PublicLinksListing.styled";

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
  getPublicUrl?: (item: T) => string;
  noLinksMessage: string;
  "data-testid"?: string;
}) => {
  if (isLoading) {
    return <Loader />;
  }

  if (data.length === 0) {
    return noLinksMessage;
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
        {data.map(item => (
          <tr key={item.id}>
            <td>
              {getUrl ? (
                <Link to={getUrl(item)} className={CS.textWrap}>
                  {item.name}
                </Link>
              ) : (
                item.name
              )}
            </td>
            {getPublicUrl && (
              <td>
                <ExternalLink
                  href={getPublicUrl(item)}
                  className={cx(CS.link, CS.textWrap)}
                >
                  {getPublicUrl(item)}
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
                  <RevokeIconWrapper name="close" aria-label={t`Revoke link`}>
                    <Icon name="close" />
                  </RevokeIconWrapper>
                </Confirm>
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  );
};
