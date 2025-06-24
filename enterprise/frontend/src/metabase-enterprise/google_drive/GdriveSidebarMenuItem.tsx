import { match } from "ts-pattern";
import { t } from "ttag";

import { skipToken } from "metabase/api";
import { Button, Flex, Icon, Menu, Text } from "metabase/ui";
import { useGetGsheetsFolderQuery } from "metabase-enterprise/api";

import { GdriveErrorMenuItem } from "./GdriveErrorMenuItem";
import { trackSheetConnectionClick } from "./analytics";
import { getStatus, useShowGdrive } from "./utils";

export function GdriveSidebarMenuItem({ onClick }: { onClick: () => void }) {
  const showGdrive = useShowGdrive();
  const { data: folder, error } = useGetGsheetsFolderQuery(
    !showGdrive ? skipToken : undefined,
    { refetchOnMountOrArgChange: 5 },
  );

  if (!showGdrive) {
    return null;
  }

  const status = getStatus({ status: folder?.status, error });

  const handleClick = () => {
    trackSheetConnectionClick({ from: "left-nav" });
    onClick();
  };

  const buttonText = match(status)
    .with("not-connected", () => t`Connect Google Sheets`)
    .with("syncing", () => t`Google Sheets`)
    .with("active", () => t`Google Sheets`)
    .otherwise(() => t`Google Sheets`);

  const helperText = match(status)
    .with("not-connected", () => null)
    .with("syncing", () => t`Syncing files...`)
    .with("active", () => t`Connected`)
    .otherwise(() => null);

  return (
    <>
      <Menu.Item onClick={handleClick}>
        <Flex gap="sm" align="flex-start" justify="space-between" w="100%">
          <Flex>
            <Icon name="google_sheet" mt="xs" mr="sm" />
            <div>
              <Text fw="bold">{buttonText}</Text>
              {helperText && (
                <Text
                  size="sm"
                  c={status === "error" ? "error" : "text-medium"}
                >
                  {helperText}
                </Text>
              )}
            </div>
          </Flex>
          {status === "active" && (
            <Button variant="subtle" onClick={handleClick}>
              {t`Add New`}
            </Button>
          )}
        </Flex>
      </Menu.Item>
      {status === "error" && <GdriveErrorMenuItem error={error ?? folder} />}
    </>
  );
}
