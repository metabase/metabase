import { t } from "ttag";

import {
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import { useConfirmation } from "metabase/common/hooks/use-confirmation";
import {
  DATA_LAYER_VISIBILITY_ICONS,
  type DataLayer,
  createDataLayer,
  getDataLayerVisibilityOptions,
  getFallbackDataLayer,
} from "metabase/metadata/data-layers";
import {
  ActionIcon,
  Box,
  Button,
  Flex,
  Icon,
  Menu,
  Select,
  Text,
  TextInputBlurChange,
} from "metabase/ui";

// Shared by the heading row and the layer rows so the headings line up
const VISIBILITY_SELECT_WIDTH = 136;
// `ActionIcon size="lg"`
const LAYER_ACTIONS_WIDTH = 40;

interface DataLayersSectionProps {
  layers: DataLayer[];
  onChange: (layers: DataLayer[]) => void;
}

/** A database's data layers in position order, with rename, visibility, reorder, add and delete. */
export function DataLayersSection({
  layers,
  onChange,
}: DataLayersSectionProps) {
  const { modalContent: confirmationModal, show: showConfirmation } =
    useConfirmation();

  const confirmDeleteLayer = (index: number) => {
    const layer = layers[index];
    const fallbackLayer = getFallbackDataLayer(layers, index);
    if (!fallbackLayer) {
      return;
    }
    showConfirmation({
      title: t`Delete the ${layer.name} layer?`,
      message: t`Schemas in this layer will move to the ${fallbackLayer.name} layer and take on its visibility. Tables set to ${layer.name} will go back to using their schema's layer. This can't be undone.`,
      confirmButtonText: t`Delete layer`,
      confirmButtonProps: { color: "negative" },
      onConfirm: () => onChange(layers.filter(({ id }) => id !== layer.id)),
    });
  };

  const updateLayer = (id: string, changes: Partial<DataLayer>) => {
    onChange(
      layers.map((layer) =>
        layer.id === id ? { ...layer, ...changes } : layer,
      ),
    );
  };

  const moveLayer = (index: number, offset: -1 | 1) => {
    const nextLayers = [...layers];
    const [layer] = nextLayers.splice(index, 1);
    nextLayers.splice(index + offset, 0, layer);
    onChange(nextLayers);
  };

  return (
    <SidebarSection
      title={t`Data layers`}
      titleAside={
        <Button
          size="compact-md"
          variant="subtle"
          leftSection={<Icon name="add" />}
          onClick={() => onChange([...layers, createDataLayer()])}
        >
          {t`Add layer`}
        </Button>
      }
    >
      <Text size="sm" c="text-secondary">
        {t`Ordered from source to presentation. Each schema uses one of these layers, and a table can override its schema's.`}
      </Text>
      <DetailsTable>
        <Flex
          align="center"
          gap="sm"
          px="lg"
          py="xs"
          bg="background_page-secondary"
        >
          <Text flex={1} size="sm" fw="bold" c="text-secondary">
            {t`Layer`}
          </Text>
          <Text
            w={VISIBILITY_SELECT_WIDTH}
            size="sm"
            fw="bold"
            c="text-secondary"
          >
            {t`Visibility`}
          </Text>
          <Box w={LAYER_ACTIONS_WIDTH} />
        </Flex>
        {layers.map((layer, index) => (
          <DataLayerRow
            key={layer.id}
            layer={layer}
            isFirst={index === 0}
            isLast={index === layers.length - 1}
            canDelete={layers.length > 1}
            onChange={(changes) => updateLayer(layer.id, changes)}
            onMoveUp={() => moveLayer(index, -1)}
            onMoveDown={() => moveLayer(index, 1)}
            onDelete={() => confirmDeleteLayer(index)}
          />
        ))}
      </DetailsTable>
      {confirmationModal}
    </SidebarSection>
  );
}

interface DataLayerRowProps {
  layer: DataLayer;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  onChange: (changes: Partial<DataLayer>) => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}

function DataLayerRow({
  layer,
  isFirst,
  isLast,
  canDelete,
  onChange,
  onMoveUp,
  onMoveDown,
  onDelete,
}: DataLayerRowProps) {
  const visibilityOptions = getDataLayerVisibilityOptions();

  const handleNameBlurChange = ({ target }: { target: HTMLInputElement }) => {
    const name = target.value.trim();
    if (name.length > 0 && name !== layer.name) {
      onChange({ name });
    }
  };

  const handleVisibilityChange = (value: string | null) => {
    const option = visibilityOptions.find((option) => option.value === value);
    if (option) {
      onChange({ visibility: option.value });
    }
  };

  return (
    <Flex align="center" gap="sm" px="lg" py="sm" data-testid="data-layer-row">
      <TextInputBlurChange
        aria-label={t`Layer name`}
        flex={1}
        miw={0}
        value={layer.name}
        placeholder={t`Layer name`}
        maxLength={254}
        resetOnEsc
        leftSection={
          <Icon
            name={DATA_LAYER_VISIBILITY_ICONS[layer.visibility]}
            c="text-secondary"
          />
        }
        // An emptied name goes back to the saved one
        normalize={(value) =>
          typeof value === "string" && value.trim().length > 0
            ? value.trim()
            : layer.name
        }
        onBlurChange={handleNameBlurChange}
      />
      <Select
        aria-label={t`Visibility`}
        w={VISIBILITY_SELECT_WIDTH}
        data={visibilityOptions}
        value={layer.visibility}
        allowDeselect={false}
        onChange={handleVisibilityChange}
      />
      <Menu position="bottom-end">
        <Menu.Target>
          <ActionIcon size="lg" aria-label={t`Layer actions`}>
            <Icon name="ellipsis" />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Item
            leftSection={<Icon name="arrow_up" />}
            disabled={isFirst}
            onClick={onMoveUp}
          >
            {t`Move up`}
          </Menu.Item>
          <Menu.Item
            leftSection={<Icon name="arrow_down" />}
            disabled={isLast}
            onClick={onMoveDown}
          >
            {t`Move down`}
          </Menu.Item>
          <Menu.Item
            c="feedback-negative"
            leftSection={<Icon name="trash" />}
            disabled={!canDelete}
            onClick={onDelete}
          >
            {t`Delete layer`}
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Flex>
  );
}
