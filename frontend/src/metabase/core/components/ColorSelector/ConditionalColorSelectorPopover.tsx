import { type HTMLAttributes, forwardRef, useState } from "react";
import { t } from "ttag";

import { useSelector } from "metabase/lib/redux";
import { getResultsMetadata } from "metabase/query_builder/selectors";
import {
  ActionIcon,
  Divider,
  Group,
  Icon,
  Select,
  Stack,
  Text,
  TextInput,
} from "metabase/ui";
import { ChartSettingInput } from "metabase/visualizations/components/settings/ChartSettingInput";
import { isString } from "metabase-lib/v1/types/utils/isa";
import type { VizSettingValueCondition } from "metabase-types/api";

import { PopoverRoot } from "./ColorSelectorPopover.styled";

interface ConditionalColorSelectorPopoverProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "onChange"> {
  value?: VizSettingValueCondition[];
  onChange: (value: VizSettingValueCondition[]) => void;
  onClose: () => void;
}

export const ConditionalColorSelectorPopover = forwardRef<
  HTMLDivElement,
  ConditionalColorSelectorPopoverProps
>(function ConditionalColorSelectorPopover(
  { value = [], onChange, onClose, ...props },
  ref,
) {
  return (
    <PopoverRoot {...props} ref={ref}>
      <Stack>
        <Header />
        {value.map((condition, i) => (
          <ConditionalColorEditor
            key={i}
            value={condition}
            onChange={nextCondition => {
              onChange([
                ...value.slice(0, i),
                nextCondition,
                ...value.slice(i + 1),
              ]);
            }}
            onRemove={() => onChange(value.filter((_, idx) => i !== idx))}
          />
        ))}
        <NewConditionalColorEditor
          onAdd={condition => {
            onChange([...value, condition]);
          }}
        />
      </Stack>
    </PopoverRoot>
  );
});

interface ConditionalColorEditorProps {
  value: VizSettingValueCondition;
  onChange: (value: VizSettingValueCondition) => void;
  onRemove?: () => void;
}

function ConditionalColorEditor({
  value,
  onChange,
  onRemove,
}: ConditionalColorEditorProps) {
  return (
    <Group>
      <div style={{ width: "380px" }}>
        <RuleEditor value={value} onChange={onChange} />
      </div>
      <Divider orientation="vertical" mx="md" />
      <div style={{ width: "210px" }}>
        <ChartSettingInput
          value={value.value ?? ""}
          onChange={nextValue => onChange({ ...value, value: nextValue })}
          columnReferenceConfig={{ isValidColumn: isString }}
        />
      </div>
      {!!onRemove && (
        <ActionIcon onClick={onRemove}>
          <Icon name="close" />
        </ActionIcon>
      )}
    </Group>
  );
}

function NewConditionalColorEditor({
  onAdd,
}: {
  onAdd: (condition: VizSettingValueCondition) => void;
}) {
  const [condition, setCondition] = useState<Partial<VizSettingValueCondition>>(
    {},
  );
  const [isRemounting, setRemounting] = useState(false);

  const handleChange = (attrs: Partial<VizSettingValueCondition>) => {
    const nextCondition = { ...condition, ...attrs };
    const isValidCondition =
      nextCondition.column &&
      nextCondition.operator &&
      typeof nextCondition.compareValue !== "undefined" &&
      typeof nextCondition.value !== "undefined";
    if (isValidCondition) {
      onAdd(nextCondition);
      setCondition({});

      // HACK
      setRemounting(true);
      setTimeout(() => setRemounting(false), 0);
    } else {
      setCondition(nextCondition);
    }
  };

  return isRemounting ? null : (
    <ConditionalColorEditor value={condition} onChange={handleChange} />
  );
}

type RuleEditorProps = ConditionalColorEditorProps;

function RuleEditor({ value, onChange }: RuleEditorProps) {
  const { columns = [] } = useSelector(getResultsMetadata) ?? {};

  const columnOptions = columns.map(col => ({
    value: col.name,
    label: col.display_name,
  }));

  return (
    <Group>
      <Select
        placeholder={t`Pick a column`}
        searchable
        value={value.column}
        data={columnOptions}
        onChange={column => onChange({ ...value, column })}
      />
      <Select
        placeholder={t`Operator`}
        searchable
        value={value.operator}
        data={["=", "!=", "<", "<=", ">", ">="]}
        // rightSection={<div />}
        // rightSectionWidth={0}
        styles={{
          root: { width: "60px" },
          input: { paddingRight: 0 },
          rightSection: { display: "none" },
        }}
        onChange={operator => onChange({ ...value, operator })}
      />
      <TextInput
        value={value.compareValue}
        placeholder={t`Value`}
        styles={{ root: { width: "80px" } }}
        onChange={e =>
          onChange({ ...value, compareValue: Number(e.target.value) })
        }
      />
    </Group>
  );
}

function Header() {
  return (
    <Group>
      <div style={{ width: "430px", display: "inline" }}>
        <Text
          size="lg"
          fw="bold"
          style={{ display: "inline" }}
        >{t`Condition`}</Text>
      </div>
      <div style={{ width: "210px", display: "inline" }}>
        <Text
          size="lg"
          fw="bold"
          style={{ display: "inline" }}
        >{t`Color`}</Text>
      </div>
    </Group>
  );
}
