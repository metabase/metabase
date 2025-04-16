import { match } from "ts-pattern";
import { t } from "ttag";

import { useSetting } from "metabase/common/hooks";
import { Button, Flex, Icon, Menu, Text } from "metabase/ui";

import { trackSheetConnectionClick } from "./analytics";
import { useShowGdrive } from "./utils";

export function GdriveSidebarMenuItem({ onClick }: { onClick: () => void }) {
  const gSheetsSetting = useSetting("gsheets");
  const showGdrive = useShowGdrive();

  if (!showGdrive) {
    return null;
  }

  const { status } = gSheetsSetting;

  const handleClick = () => {
    trackSheetConnectionClick({ from: "left-nav" });
    onClick();
  };

  const buttonText = match(status)
    .with("not-connected", () => t`Connect Google Sheets`)
    .with("loading", () => t`Google Sheets`)
    .with("complete", () => t`Google Sheets`)
    .otherwise(() => t`Google Sheets`);

  const helperText = match(status)
    .with("not-connected", () => null)
    .with("loading", () => t`Importing files...`)
    .with("complete", () => t`Connected`)
    .otherwise(() => null);

  return (
    <Menu.Item onClick={handleClick} disabled={status === "loading"}>
      <Flex gap="sm" align="flex-start" justify="space-between" w="100%">
        <Flex>
          <Icon name="google_sheet" mt="xs" mr="sm" />
          <div>
            <Text
              fw="bold"
              c={status === "loading" ? "text-light" : "text-dark"}
            >
              {buttonText}
            </Text>
            {helperText && (
              <Text size="sm" c="text-medium">
                {helperText}
              </Text>
            )}
          </div>
        </Flex>
        {status === "complete" && (
          <Button variant="subtle" onClick={handleClick}>
            {t`Add New`}
          </Button>
        )}
      </Flex>
    </Menu.Item>
  );
}
