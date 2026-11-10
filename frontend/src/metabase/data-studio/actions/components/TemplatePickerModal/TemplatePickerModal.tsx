import { LoadingAndErrorWrapper } from "metabase/common/components/LoadingAndErrorWrapper";
import {
  Icon,
  Modal,
  NavLink,
  ScrollArea,
  Stack,
  Tabs,
  Text,
} from "metabase/ui";

export type TemplatePickerItem = {
  id: string;
  name: string;
  description: string;
};

export type TemplatePickerCategory = {
  id: string;
  name: string;
  items: TemplatePickerItem[];
};

type TemplatePickerModalProps = {
  title: string;
  categories: TemplatePickerCategory[];
  isLoading: boolean;
  error: unknown;
  onSelect: (itemId: string) => void;
  onClose: () => void;
};

export function TemplatePickerModal({
  title,
  categories,
  isLoading,
  error,
  onSelect,
  onClose,
}: TemplatePickerModalProps) {
  return (
    <Modal title={title} size="xl" opened onClose={onClose}>
      {isLoading || error != null ? (
        <LoadingAndErrorWrapper loading={isLoading} error={error} />
      ) : (
        <Tabs
          defaultValue={categories[0]?.id}
          orientation="vertical"
          h="24rem"
          mt="sm"
        >
          <Tabs.List w="12rem">
            {categories.map((category) => (
              <Tabs.Tab key={category.id} value={category.id}>
                {category.name}
              </Tabs.Tab>
            ))}
          </Tabs.List>
          {categories.map((category) => (
            <Tabs.Panel key={category.id} value={category.id} pl="lg">
              <ScrollArea h="100%">
                <Stack gap="xs">
                  {category.items.map((item) => (
                    <NavLink
                      key={item.id}
                      label={<TemplatePickerItemLabel item={item} />}
                      rightSection={<Icon name="chevronright" />}
                      onClick={() => onSelect(item.id)}
                    />
                  ))}
                </Stack>
              </ScrollArea>
            </Tabs.Panel>
          ))}
        </Tabs>
      )}
    </Modal>
  );
}

type TemplatePickerItemLabelProps = {
  item: TemplatePickerItem;
};

function TemplatePickerItemLabel({ item }: TemplatePickerItemLabelProps) {
  return (
    <Stack gap="xs" py="xs">
      <Text fw="bold">{item.name}</Text>
      <Text size="sm" c="text-secondary">
        {item.description}
      </Text>
    </Stack>
  );
}
