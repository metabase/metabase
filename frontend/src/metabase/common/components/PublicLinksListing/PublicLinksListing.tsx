import cx from "classnames";
import { useState } from "react";
import { t } from "ttag";

import { ConfirmModal } from "metabase/common/components/ConfirmModal";
import { ExternalLink } from "metabase/common/components/ExternalLink";
import { Link } from "metabase/common/components/Link";
import {
  LoadingSkeleton,
  getSkeletonLineWidth,
} from "metabase/common/components/Skeletons";
import AdminS from "metabase/css/admin.module.css";
import CS from "metabase/css/core/index.css";
import { ActionIcon, Box, Icon, Skeleton, Text } from "metabase/ui";

const SKELETON_ROW_COUNT = 3;

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
  isLoading?: boolean;
  revoke?: (item: T) => Promise<unknown>;
  getUrl: (item: T) => string;
  getPublicUrl?: (item: T) => string | null;
  noLinksMessage: string;
  "data-testid"?: string;
}) => {
  const [linkToRevoke, setLinkToRevoke] = useState<undefined | T>();
  const handleCloseModal = () => setLinkToRevoke(undefined);

  if (isLoading) {
    return (
      <PublicLinksTableSkeleton
        hasPublicUrlColumn={Boolean(getPublicUrl)}
        hasRevokeColumn={Boolean(revoke)}
      />
    );
  }

  if (data.length === 0) {
    return (
      <Box
        bg="background_page-secondary"
        bd="1px solid var(--mb-color-border-neutral)"
        bdrs="xxs"
        px="lg"
        py="lg"
      >
        <Text c="text-secondary">{noLinksMessage}</Text>
      </Box>
    );
  }

  return (
    <div className={cx(CS.bordered, CS.rounded, CS.full)}>
      <table data-testid={dataTestId} className={AdminS.ContentTable}>
        <PublicLinksTableHeader
          hasPublicUrlColumn={Boolean(getPublicUrl)}
          hasRevokeColumn={Boolean(revoke)}
        />
        <tbody>
          {data.map((item) => {
            const internalUrl = getUrl(item);
            const publicUrl = getPublicUrl?.(item);

            return (
              <tr key={item.id}>
                <Link to={internalUrl} className={cx(CS.flex, CS.fullWidth)}>
                  <td>{item.name}</td>
                </Link>

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
                    <ActionIcon
                      variant="subtle"
                      aria-label={t`Revoke link`}
                      onClick={() => setLinkToRevoke(item)}
                    >
                      <Icon name="close" />
                    </ActionIcon>
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
        <ConfirmModal
          opened={Boolean(linkToRevoke)}
          title={t`Disable this link?`}
          content={t`They won't work anymore, and can't be restored, but you can create new links.`}
          onClose={handleCloseModal}
          onConfirm={async () => {
            if (revoke && linkToRevoke) {
              await revoke(linkToRevoke);
              handleCloseModal();
            }
          }}
        />
      </table>
    </div>
  );
};

type PublicLinksTableColumnsProps = {
  hasPublicUrlColumn: boolean;
  hasRevokeColumn: boolean;
};

const PublicLinksTableHeader = ({
  hasPublicUrlColumn,
  hasRevokeColumn,
}: PublicLinksTableColumnsProps) => (
  <thead>
    <tr>
      <th>{t`Name`}</th>
      {hasPublicUrlColumn && <th>{t`Public Link`}</th>}
      {hasRevokeColumn && <th>{t`Revoke Link`}</th>}
    </tr>
  </thead>
);

const PublicLinksTableSkeleton = ({
  hasPublicUrlColumn,
  hasRevokeColumn,
}: PublicLinksTableColumnsProps) => (
  <LoadingSkeleton className={cx(CS.bordered, CS.rounded, CS.full)} gap={0}>
    <table className={AdminS.ContentTable}>
      <PublicLinksTableHeader
        hasPublicUrlColumn={hasPublicUrlColumn}
        hasRevokeColumn={hasRevokeColumn}
      />
      <tbody>
        {Array.from({ length: SKELETON_ROW_COUNT }, (_, index) => (
          <tr key={index}>
            <td>
              <Skeleton h={14} w={getSkeletonLineWidth(index)} />
            </td>
            {hasPublicUrlColumn && (
              <td>
                <Skeleton h={14} w={getSkeletonLineWidth(index + 3)} />
              </td>
            )}
            {hasRevokeColumn && (
              <td>
                <Skeleton h={16} w={16} mx="auto" />
              </td>
            )}
          </tr>
        ))}
      </tbody>
    </table>
  </LoadingSkeleton>
);
