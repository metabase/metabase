import { useCallback, useEffect, useMemo, useState } from "react";
import { t } from "ttag";

import {
  useGetTableDataQuery,
  useGetTableQueryMetadataQuery,
} from "metabase/api";
import { FIELD_SEMANTIC_TYPES_MAP } from "metabase/lib/core";
import { getBaseCondition } from "metabase/notifications/utils";
import {
  Button,
  Flex,
  Icon,
  Menu,
  Select,
  Stack,
  Text,
  rem,
} from "metabase/ui";
import { EditingBodyCellConditional } from "metabase-enterprise/data_editing/tables/edit/inputs";
import * as Lib from "metabase-lib";
import type {
  ComparisonOperator,
  ConditionalAlertExpression,
  FieldId,
  FieldWithMetadata,
  Literal,
  LogicalOperator,
  MultipleConditionalAlertExpressions,
  NotificationTriggerEvent,
  SingleConditionalAlertExpression,
  TableId,
} from "metabase-types/api";
import type { DatasetColumn } from "metabase-types/api/dataset";

// Types for the condition builder UI
type ColumnType =
  | "type/Text"
  | "type/Integer"
  | "type/BigInteger"
  | "type/Float"
  | "type/Boolean"
  | "type/Date"
  | "type/DateTime"
  | "type/DateTimeWithLocalTZ";

type ConditionBuilderColumn = DatasetColumn & {
  field: FieldWithMetadata;
  isNumeric: boolean;
  isBoolean: boolean;
  isStringOrStringLike: boolean;
};

const SUPPORTED_TYPES = [
  "type/PK",
  "type/Text",
  "type/Integer",
  "type/BigInteger",
  "type/Float",
  "type/Boolean",
];

interface OperatorOption {
  value: ComparisonOperator;
  label: string;
  applicableTypes: ColumnType[];
}

interface ConditionRow {
  id: string;
  columnId: FieldId | null;
  columnName: string | null;
  operator: ComparisonOperator | null;
  value: Literal;
}

interface AlertConditionBuilderProps {
  tableId: TableId;
  eventType: NotificationTriggerEvent;
  onChange?: (expression: ConditionalAlertExpression) => void;
  initialExpression?: ConditionalAlertExpression;
}

// Define operators outside of component to avoid recreation on each render
const OPERATORS: OperatorOption[] = [
  {
    value: "=",
    label: "Equal to",
    applicableTypes: [
      "type/Text",
      "type/Integer",
      "type/BigInteger",
      "type/Float",
      "type/Boolean",
      "type/Date",
      "type/DateTime",
    ],
  },
  {
    value: "!=",
    label: "Not equal to",
    applicableTypes: [
      "type/Text",
      "type/Integer",
      "type/BigInteger",
      "type/Float",
      "type/Boolean",
      "type/Date",
      "type/DateTime",
    ],
  },
  {
    value: ">",
    label: "Higher than",
    applicableTypes: ["type/Integer", "type/BigInteger", "type/Float"],
  },
  {
    value: "<",
    label: "Lower than",
    applicableTypes: ["type/Integer", "type/BigInteger", "type/Float"],
  },
  {
    value: ">=",
    label: "Greater than or equal to",
    applicableTypes: ["type/Integer", "type/BigInteger", "type/Float"],
  },
  {
    value: "<=",
    label: "Less than or equal to",
    applicableTypes: ["type/Integer", "type/BigInteger", "type/Float"],
  },
];

// Component for a single condition row
const ConditionRowComponent = ({
  condition,
  onUpdate,
  onRemove,
  columns,
}: {
  condition: ConditionRow;
  onUpdate: (id: string, updates: Partial<ConditionRow>) => void;
  onRemove: (id: string) => void;
  columns: Array<ConditionBuilderColumn>;
}) => {
  const selectedColumn = condition.columnId
    ? columns.find((col) => col.id === Number(condition.columnId))
    : columns[0];

  const columnType = selectedColumn?.effective_type as ColumnType | undefined;
  // Filter operators based on column type

  // Get operators based on column type, or all operators if no column selected
  const filteredOperators = columnType
    ? OPERATORS.filter((op: OperatorOption) =>
        op.applicableTypes.includes(columnType),
      )
    : OPERATORS;

  // Helper to get a default value based on column type
  const getDefaultValueForType = (columnType: ColumnType | undefined): any => {
    if (!columnType) {
      return undefined;
    }

    switch (true) {
      case columnType.includes("Integer"):
      case columnType.includes("Float"):
      case columnType.includes("Decimal"):
        return 0;
      case columnType.includes("Boolean"):
        return true;
      case columnType.includes("Date"):
      case columnType.includes("Time"):
        return new Date().toISOString().split("T")[0]; // YYYY-MM-DD format
      case columnType.includes("Text"):
        return "";
      default:
        return undefined;
    }
  };

  const handleColumnChange = (columnId: FieldId | null) => {
    // When a column is selected, automatically select the first applicable operator and set default value
    if (columnId) {
      const selectedColumn = columns.find((col) => col.id === Number(columnId));
      const columnType = selectedColumn?.effective_type as
        | ColumnType
        | undefined;

      if (columnType) {
        const applicableOperators = OPERATORS.filter((op) =>
          op.applicableTypes.includes(columnType),
        );

        if (applicableOperators.length > 0) {
          const defaultValue = getDefaultValueForType(columnType);

          onUpdate(condition.id, {
            columnId,
            columnName: selectedColumn?.name || null,
            operator: applicableOperators[0].value as ComparisonOperator,
            value: defaultValue,
          });
          return;
        }
      }
    }

    // If no column selected or no applicable operators found
    onUpdate(condition.id, {
      columnId: null,
      columnName: null,
      operator: null,
      value: null,
    });
  };

  const handleOperatorChange = (operator: ComparisonOperator | null) => {
    onUpdate(condition.id, { operator });
  };

  const handleValueChange = (value: string) => {
    const parsedValue = parseLiteral(value, selectedColumn);
    onUpdate(condition.id, { value: parsedValue });
  };

  // Helper function to get operator icon/symbol
  const getOperatorIcon = (operator: ComparisonOperator | null) => {
    switch (operator) {
      case "=":
        return "=";
      case "!=":
        return "≠";
      case ">":
        return ">";
      case "<":
        return "<";
      case ">=":
        return "≥";
      case "<=":
        return "≤";
      default:
        return "=";
    }
  };

  // Prepare UI for the condition row
  return (
    <Flex gap="xs" align="center" w="100%">
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 32px 1fr",
          gap: "8px",
          alignItems: "center",
          width: "100%",
        }}
      >
        <Select
          data={columns.map((col) => ({
            value: col.id?.toString() || "",
            label: col.display_name,
            icon: getColumnIcon(col),
          }))}
          value={condition.columnId?.toString() || ""}
          onChange={(newValue) => handleColumnChange(Number(newValue))}
          placeholder={t`Select column`}
          searchable
          clearable
          style={{ width: "100%" }}
        />

        {selectedColumn && (
          <>
            <Menu position="bottom" withinPortal>
              <Menu.Target>
                <Button
                  style={{
                    width: "32px",
                    height: "32px",
                    padding: 0,
                    display: "flex",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                  fz="lg"
                  fw={500}
                >
                  <Text>{getOperatorIcon(condition.operator)}</Text>
                </Button>
              </Menu.Target>
              <Menu.Dropdown>
                {filteredOperators.map((op: OperatorOption) => (
                  <Menu.Item
                    key={op.value}
                    onClick={() => handleOperatorChange(op.value)}
                    leftSection={
                      <Text fw={600}>
                        {getOperatorIcon(op.value as ComparisonOperator)}
                      </Text>
                    }
                  >
                    {op.label}
                  </Menu.Item>
                ))}
              </Menu.Dropdown>
            </Menu>

            <EditingBodyCellConditional
              field={selectedColumn?.field}
              datasetColumn={selectedColumn}
              initialValue={condition.value}
              onSubmit={(value) => handleValueChange(value as string)}
              onCancel={() => {}}
              inputProps={{ disabled: false, placeholder: "" }}
            />
          </>
        )}
      </div>

      <Button
        variant="subtle"
        onClick={() => onRemove(condition.id)}
        p={0}
        style={{
          width: "2rem",
          flexShrink: 0,
          display: "flex",
          justifyContent: "center",
        }}
        styles={{ label: { display: "flex" } }}
      >
        <Icon name="close" />
      </Button>
    </Flex>
  );
};

export const AlertConditionBuilder = ({
  tableId,
  eventType,
  onChange,
  initialExpression,
}: AlertConditionBuilderProps) => {
  const { data: tableMetadata } = useGetTableQueryMetadataQuery({
    id: tableId,
  });
  const { data: datasetData } = useGetTableDataQuery({
    tableId,
  });

  const [areConditionsEnabled, setConditionsEnabled] = useState(false);

  // Convert table fields to column options
  const columns = useMemo(() => {
    return (datasetData?.data?.cols || [])
      .map((col) => {
        const field = tableMetadata?.fields?.find((f) => f.name === col.name);
        const typeInfo = Lib.legacyColumnTypeInfo(col);
        return {
          ...col,
          field,
          isNumeric: Lib.isNumeric(typeInfo),
          isStringOrStringLike: Lib.isStringOrStringLike(typeInfo),
          isBoolean: Lib.isBoolean(typeInfo),
        } as ConditionBuilderColumn;
      })
      .filter(
        (col) =>
          col.visibility_type === "normal" &&
          (SUPPORTED_TYPES.includes(col.field?.semantic_type as string) ||
            SUPPORTED_TYPES.includes(col.field?.effective_type as ColumnType)),
      );
  }, [datasetData?.data?.cols, tableMetadata?.fields]);

  // Initialize conditions from initialExpression or with a single empty condition
  const [conditions, setConditions] = useState<ConditionRow[]>([]);
  const [logicalOperator, setLogicalOperator] =
    useState<LogicalOperator>("and");

  const populateInitialState = useCallback(() => {
    const {
      conditions: initialConditions,
      logicalOperator: initialLogicalOperator,
    } = parseInitialExpression(initialExpression, columns);
    setConditions(initialConditions);
    setLogicalOperator(initialLogicalOperator);
  }, [initialExpression, columns]);

  // Initial state population.
  useEffect(() => {
    if (!initialExpression) {
      return;
    }
    populateInitialState();
    if (doesExpressionHaveClientSideConditions(initialExpression)) {
      setConditionsEnabled(true);
    }
  }, [populateInitialState, initialExpression]);

  // Handle adding a new condition
  // const handleAddCondition = () => {
  //   setConditions([
  //     ...conditions,
  //     {
  //       id: crypto.randomUUID(),
  //       columnId: null,
  //       columnName: null,
  //       operator: null,
  //       value: null,
  //     },
  //   ]);
  // };

  // Handle updating a condition
  const handleUpdateCondition = useCallback(
    (id: string, updates: Partial<ConditionRow>) => {
      setConditions((conditions) =>
        conditions.map((condition) =>
          condition.id === id ? { ...condition, ...updates } : condition,
        ),
      );
    },
    [],
  );

  // Handle removing a condition
  const handleRemoveCondition = (id: string) => {
    // TODO: Consider running onChange here.
    const newConditions = conditions.filter((condition) => condition.id !== id);
    setConditions(newConditions);
    if (newConditions.length === 0) {
      // onChange?.(null);
      setConditionsEnabled(false);
    }
    // } else {
    //   onChange?.(generateExpression(tableId, newConditions, logicalOperator));
    // }
  };

  // Handle changing the logical operator
  const handleOperatorChange = useCallback((value: string | null) => {
    if (value === "and" || value === "or") {
      setLogicalOperator(value);
    }
  }, []);

  useEffect(() => {
    const expression = generateExpression(
      tableId,
      eventType,
      conditions,
      logicalOperator,
    );
    onChange?.(expression);
  }, [
    initialExpression,
    conditions,
    logicalOperator,
    onChange,
    tableId,
    eventType,
  ]);

  if (!areConditionsEnabled) {
    return (
      <Button
        variant="subtle"
        p={0}
        onClick={() => {
          populateInitialState();
          setConditionsEnabled(true);
        }}
      >
        {t`Add conditions for alerts`}
      </Button>
    );
  }

  return (
    <Stack gap="sm" w="100%">
      <Text size="lg" style={{ marginRight: "auto" }}>
        {t`Notify if the following condition is met`}
      </Text>
      {conditions.length > 1 && (
        <Flex align="center">
          <Select
            data={[
              { value: "and", label: t`AND` },
              { value: "or", label: t`OR` },
            ]}
            value={logicalOperator}
            onChange={handleOperatorChange}
            style={{ width: rem(100) }}
          />
        </Flex>
      )}

      <Stack gap="xs">
        {conditions.map((condition) => (
          <ConditionRowComponent
            key={condition.id}
            condition={condition}
            onUpdate={handleUpdateCondition}
            onRemove={handleRemoveCondition}
            columns={columns}
          />
        ))}
      </Stack>
      {/* Multiple conditions support will be implemented later. */}
      {/* <Button
          variant="outline"
          leftSection={<Icon name="add" />}
          onClick={handleAddCondition}
          mt="sm"
        >
          {t`Add condition`}
        </Button> */}
    </Stack>
  );
};

// Parse initial expression into condition rows
function parseInitialExpression(
  initialExpression: ConditionalAlertExpression | undefined,
  columns: ConditionBuilderColumn[],
): { conditions: ConditionRow[]; logicalOperator: LogicalOperator } {
  const defaultCondition = {
    conditions: [
      {
        id: crypto.randomUUID(),
        columnId: null,
        columnName: null,
        operator: null,
        value: null,
      },
    ],
    logicalOperator: "and" as LogicalOperator,
  };

  // As a temporary solution, we need to hide an important implementation detail
  // from the client.
  // Currently, each condition has a required table_id comparison at the top level.
  // Eg.: '["=",["context","table_id"],8]'.
  // But it should not be exposed to the Condition Builder component, user cannot affect it.
  // An example of an actual conditional expression in that case would look like this:
  // Eg.: '["and",["=",["context","table_id"],8],["=",["context","PAYMENT"],0]]'
  // So we need to omit the table_id condition, and move directly to the 2nd nesting level,
  // before parsing the expression.

  const clientSideCondition = doesExpressionHaveClientSideConditions(
    initialExpression,
  )
    ? initialExpression[3]
    : null;

  if (!clientSideCondition) {
    // If no initial expression, start with a single empty condition
    return defaultCondition;
  }

  try {
    // Check if it's a single condition or multiple conditions
    if (Array.isArray(clientSideCondition) && clientSideCondition.length > 0) {
      const firstElement = clientSideCondition[0];

      // Case 1: Single condition - ["=", ["context", "row_change", "before", "field_name"], value]
      if (
        typeof firstElement === "string" &&
        ["=", "!=", ">", "<", ">=", "<="].includes(firstElement)
      ) {
        const operator = firstElement as ComparisonOperator;
        const fieldRef = clientSideCondition[1];
        const value = clientSideCondition[2] as any;

        if (
          Array.isArray(fieldRef) &&
          fieldRef[0] === "context" &&
          fieldRef.length > 1
        ) {
          const columnName = fieldRef[2] as string;

          return {
            conditions: [
              {
                id: crypto.randomUUID(),
                columnId:
                  columns.find((col) => col.name === columnName)?.id || null,
                columnName,
                operator,
                value,
              },
            ],
            logicalOperator: "and" as LogicalOperator,
          };
        }
      }

      // Case 2: Multiple conditions - ["and"/"or", [...condition1], [...condition2], ...]
      if (
        typeof firstElement === "string" &&
        ["and", "or"].includes(firstElement)
      ) {
        const logicalOperator = firstElement as LogicalOperator;
        const parsedConditions: ConditionRow[] = [];

        // Process each condition expression
        for (let i = 1; i < clientSideCondition.length; i++) {
          const conditionExpr = clientSideCondition[i];

          if (Array.isArray(conditionExpr) && conditionExpr.length >= 3) {
            const operator = conditionExpr[0] as ComparisonOperator;
            const fieldRef = conditionExpr[1];
            const value = conditionExpr[2] as any;

            if (
              Array.isArray(fieldRef) &&
              fieldRef[0] === "context" &&
              fieldRef.length > 1
            ) {
              const columnName = fieldRef[2] as string;

              parsedConditions.push({
                id: crypto.randomUUID(),
                columnId:
                  columns.find((col) => col.name === columnName)?.id || null,
                columnName,
                operator,
                value,
              });
            }
          }
        }

        if (parsedConditions.length > 0) {
          return {
            conditions: parsedConditions,
            logicalOperator,
          };
        }
      }
    }
  } catch (error) {
    console.error("Error parsing initial expression:", error);
  }

  // Fallback to default if parsing fails
  return defaultCondition;
}

// Generate the expression based on current conditions
function generateExpression(
  tableId: TableId,
  eventType: NotificationTriggerEvent,
  conditions?: ConditionRow[],
  logicalOperator?: LogicalOperator,
): ConditionalAlertExpression {
  const baseExpression = getBaseCondition(tableId, eventType);

  if (!conditions) {
    return baseExpression;
  }

  const validConditions = conditions.filter(
    (c) =>
      c.columnId && c.operator && c.value !== null && c.value !== undefined,
  );

  if (validConditions.length === 0) {
    return baseExpression;
  }

  // TODO: This is a temprorary workaround until we have a better abstraction
  // on the API side to specify conditions for different event types.
  // Basically, the meaningful payload of the event can have different paths.
  // For 'create' and 'update' event, it will be under 'after' key.
  // For 'delete' event, it will be under 'before' key.

  const payloadPath = ["context", "record"];

  if (validConditions.length === 1) {
    const condition = validConditions[0];

    return [
      ...baseExpression,
      [
        condition.operator as ComparisonOperator,
        [...payloadPath, condition.columnName],
        condition.value,
      ] as SingleConditionalAlertExpression,
    ];
  }

  return [
    ...baseExpression,
    [
      logicalOperator as LogicalOperator,
      ...validConditions.map((condition) => [
        condition.operator,
        [...payloadPath, condition.columnName],
        condition.value,
      ]),
    ] as MultipleConditionalAlertExpressions,
  ];
}

function getColumnIcon(column: ConditionBuilderColumn) {
  if (column.isBoolean) {
    return "io";
  }

  const semanticTypeIcon =
    FIELD_SEMANTIC_TYPES_MAP[
      (column.semantic_type ||
        column.effective_type ||
        column.base_type) as string
    ]?.icon;
  if (semanticTypeIcon) {
    return semanticTypeIcon;
  }

  if (column.isNumeric) {
    return "int";
  }

  return "string";
}

function doesExpressionHaveClientSideConditions(
  expression?: ConditionalAlertExpression,
): expression is ConditionalAlertExpression {
  return Array.isArray(expression) && Array.isArray(expression[3]);
}

function parseLiteral(
  value: string,
  selectedColumn: ConditionBuilderColumn | undefined,
) {
  if (!selectedColumn) {
    return value;
  }

  if (selectedColumn.isBoolean) {
    return value === "true";
  }

  if (selectedColumn.isNumeric) {
    return Number(value);
  }

  return value;
}
