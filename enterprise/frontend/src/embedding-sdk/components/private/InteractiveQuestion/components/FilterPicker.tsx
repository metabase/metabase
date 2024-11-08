import { getColumnIcon } from "metabase/common/utils/columns";
import { getGroupItems } from "metabase/querying/filters/hooks/use-filter-modal/utils";
import {
  Accordion,
  Box,
  Group,
  Icon,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";

import { useInteractiveQuestionContext } from "../context";

interface Props {
  className?: string;
  withIcon?: boolean;
}

export const FilterPicker = ({ className, withIcon = false }: Props) => {
  const { question } = useInteractiveQuestionContext();

  const query = question?.query();
  const groups = query ? getGroupItems(query) : [];

  return (
    <Box p="sm" className={className}>
      <TextInput
        placeholder="Search..."
        icon={<Icon size={16} name="search" />}
        mb="md"
      />

      <Accordion>
        {groups.map(group => (
          <Accordion.Item key={group.key} value={group.displayName}>
            <Accordion.Control>{group.displayName}</Accordion.Control>
            <Accordion.Panel>
              <Stack spacing="xs">
                {group.columnItems.map((columnItem, index) => (
                  <Group key={index} spacing="xs">
                    {withIcon && (
                      <Icon size={16} name={getColumnIcon(columnItem.column)} />
                    )}

                    <Text>{columnItem.displayName}</Text>
                  </Group>
                ))}
              </Stack>
            </Accordion.Panel>
          </Accordion.Item>
        ))}
      </Accordion>
    </Box>
  );
};
