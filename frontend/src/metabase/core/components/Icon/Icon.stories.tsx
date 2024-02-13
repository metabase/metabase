import { useState } from "react";
import { Box, TextInput, Stack } from "metabase/ui";
import { Icon } from "./Icon";
import { iconNames } from "./icons";

export default {
  title: "Components/Icon",
  component: Icon,
};

const Template = () => {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredIconNames = iconNames.filter(name =>
    name.includes(searchQuery.toLowerCase()),
  );

  return (
    <Stack>
      <TextInput
        value={searchQuery}
        type="search"
        placeholder="Search"
        onChange={e => setSearchQuery(e.target.value)}
      />
      <Box>
        {filteredIconNames.map(icon => (
          <Box key={icon} display="inline-block" w="100px" m="20px" ta="center">
            <p>{icon}</p>
            <Icon name={icon} />
          </Box>
        ))}
      </Box>
    </Stack>
  );
};

export const Default = Template.bind({});
