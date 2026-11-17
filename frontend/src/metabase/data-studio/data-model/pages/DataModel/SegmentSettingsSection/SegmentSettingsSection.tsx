import { t } from "ttag";

import {
  DetailsRow,
  DetailsTable,
  SidebarSection,
} from "metabase/common/components/DetailSidebar";
import {
  DEFAULT_REQUIRED_FILTER_ROW_THRESHOLD,
  type ResolvedSegmentSettings,
  type SegmentSettingsOverrides,
  useSegmentSettings,
} from "metabase/metadata/table-segments";
import { Button, Icon, NumberInput, Switch, Text, Tooltip } from "metabase/ui";
import type { DatabaseId, SchemaName } from "metabase-types/api";

import { DETAILS_CELL_INPUT_CLASS_NAMES } from "../DetailPanel";

interface SegmentSettingsSectionProps {
  databaseId: DatabaseId;
  /** Set for a schema's settings; left out for its database's */
  schemaName?: SchemaName;
}

const INSTANCE_SETTINGS: ResolvedSegmentSettings = {
  generateSegments: { value: true, source: "instance" },
  requiredFilterRowThreshold: {
    value: DEFAULT_REQUIRED_FILTER_ROW_THRESHOLD,
    source: "instance",
  },
};

/**
 * PROTOTYPE: mocked. Whether sync generates segments for the tables here, and
 * how big a table must be to get a proposed required filter. A schema's
 * settings win over its database's, which win over the instance default.
 */
export function SegmentSettingsSection({
  databaseId,
  schemaName,
}: SegmentSettingsSectionProps) {
  const {
    getSegmentSettings,
    getDatabaseSegmentSettings,
    getSchemaSegmentSettings,
    setDatabaseSegmentSettings,
    setSchemaSegmentSettings,
  } = useSegmentSettings();
  const isSchema = schemaName != null;
  const overrides = isSchema
    ? getSchemaSegmentSettings(databaseId, schemaName)
    : getDatabaseSegmentSettings(databaseId);
  const settings = getSegmentSettings(databaseId, schemaName);
  // What applies here without this level's own setting
  const inherited = isSchema
    ? getSegmentSettings(databaseId)
    : INSTANCE_SETTINGS;
  const parentLabel = isSchema ? t`the database` : t`the instance default`;

  const update = (change: SegmentSettingsOverrides) =>
    isSchema
      ? setSchemaSegmentSettings(databaseId, schemaName, change)
      : setDatabaseSegmentSettings(databaseId, change);

  return (
    <SidebarSection
      title={t`Segments and filters`}
      description={
        isSchema
          ? t`Applies to every table in this schema.`
          : t`Applies to every table in this database unless its schema overrides it.`
      }
    >
      <DetailsTable>
        <DetailsRow
          label={t`Generate segments`}
          labelNote={
            <InheritanceNote
              isOverridden={overrides.generateSegments !== undefined}
              parentLabel={parentLabel}
              onReset={() => update({ generateSegments: undefined })}
            />
          }
          value={
            <Switch
              py="xs"
              label={t`Build system segments and propose cohorts`}
              checked={settings.generateSegments.value}
              onChange={(event) => {
                const generateSegments = event.target.checked;
                // Matching the inherited value is the same as not setting it
                update({
                  generateSegments:
                    generateSegments === inherited.generateSegments.value
                      ? undefined
                      : generateSegments,
                });
              }}
              data-testid="generate-segments-switch"
            />
          }
        />
        <DetailsRow
          label={
            <>
              {t`Required filter row threshold`}
              <Tooltip
                label={t`Add required filters for tables exceeding this many rows`}
                maw={280}
                multiline
              >
                <Icon
                  name="info"
                  size={14}
                  ml="xs"
                  c="text-secondary"
                  aria-label={t`Add required filters for tables exceeding this many rows`}
                  // Sits on the text's baseline inside the label paragraph
                  style={{ verticalAlign: "-2px" }}
                />
              </Tooltip>
            </>
          }
          fillValue
          value={
            <NumberInput
              aria-label={t`Required filter row threshold`}
              classNames={DETAILS_CELL_INPUT_CLASS_NAMES}
              value={overrides.requiredFilterRowThreshold ?? ""}
              placeholder={inherited.requiredFilterRowThreshold.value.toLocaleString()}
              min={1}
              allowDecimal={false}
              allowNegative={false}
              thousandSeparator=","
              hideControls
              rightSection={<Icon name="pencil" size={14} c="text-secondary" />}
              rightSectionPointerEvents="none"
              onChange={(value) =>
                update({
                  // Cleared: inherit again
                  requiredFilterRowThreshold:
                    typeof value === "number" && value > 0 ? value : undefined,
                })
              }
              data-testid="required-filter-threshold-input"
            />
          }
        />
      </DetailsTable>
    </SidebarSection>
  );
}

/** Once a value is set here, says what it overrides, with a reset */
function InheritanceNote({
  isOverridden,
  parentLabel,
  onReset,
}: {
  isOverridden: boolean;
  parentLabel: string;
  onReset: () => void;
}) {
  if (!isOverridden) {
    return null;
  }
  return (
    <>
      <Text size="sm" c="text-secondary">
        {t`Overrides ${parentLabel}`}
      </Text>
      <Button size="compact-sm" variant="subtle" px={0} onClick={onReset}>
        {t`Reset`}
      </Button>
    </>
  );
}
