import { Box, Flex, Text, UnstyledButton } from "metabase/ui";

import { MetabotIcon } from "../MetabotIcon";

import Styles from "./MetabotStartChatButtont.module.css";

export const MetabotStartChatButton = ({
  onClick,
}: {
  onClick: () => void;
}) => {
  return (
    <UnstyledButton onClick={onClick} className={Styles.container}>
      <Flex gap="sm" className={Styles.innerContainer}>
        <Box w="33px" h="24px">
          <MetabotIcon />
        </Box>
        <Text>Try Metabot!</Text>
      </Flex>
    </UnstyledButton>
  );
};
