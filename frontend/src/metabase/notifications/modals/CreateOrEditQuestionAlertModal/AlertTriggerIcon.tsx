import { Center, Icon } from "metabase/ui";

export const AlertTriggerIcon = () => {
  return (
    <Center
      p="0.625rem"
      bg="brand"
      w="2.5rem"
      h="2.5rem"
      style={{
        borderRadius: "100%",
      }}
    >
      <Icon name="alert" c="white" />
    </Center>
  );
};
