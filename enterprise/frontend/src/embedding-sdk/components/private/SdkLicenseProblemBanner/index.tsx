import type { SdkLicenseProblem } from "embedding-sdk/types/license-problem";
import LogoIcon from "metabase/components/LogoIcon";
import { Box, HoverCard, Icon, Text } from "metabase/ui";

interface Props {
  problem: SdkLicenseProblem | null;
}

export const SdkLicenseProblemBanner = ({ problem }: Props) => {
  if (!problem) {
    return null;
  }

  return (
    <HoverCard position="top">
      <HoverCard.Target>
        <Box>
          <Box>
            <LogoIcon />
          </Box>

          <Box>
            <Icon name="warning" />

            <Text>Warning</Text>
          </Box>
        </Box>
      </HoverCard.Target>

      <HoverCard.Dropdown>
        <Text size="sm">{problem.message}</Text>
      </HoverCard.Dropdown>
    </HoverCard>
  );
};
