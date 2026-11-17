import cx from "classnames";
import type { ReactNode } from "react";
import { useMemo } from "react";

import {
  AccordionList,
  type Section,
} from "metabase/common/components/AccordionList";
import CS from "metabase/css/core/index.css";
import { Icon, Tooltip } from "metabase/ui";

import { DataSelectorLoading } from "../DataSelectorLoading";
import type { DataSelectorDatabase, DataSelectorSchema } from "../types";

type DataSelectorDatabasePickerProps = {
  databases: DataSelectorDatabase[];
  hasFiltering?: boolean;
  hasInitialFocus?: boolean;
  hasNextStep?: boolean;
  isLoading?: boolean;
  selectedDatabase?: DataSelectorDatabase;
  selectedSchema?: DataSelectorSchema;
  onChangeDatabase: (database: DataSelectorDatabase) => void;
  onChangeSchema: (schema?: DataSelectorSchema) => void;
  databaseIsDisabled?: (database: DataSelectorDatabase) => boolean;
  databaseDisabledTooltip?: (
    database: DataSelectorDatabase,
  ) => string | undefined;
};

type Item = {
  name: string;
  index: number;
  database: DataSelectorDatabase;
};

export const DataSelectorDatabasePicker = ({
  databases,
  selectedDatabase,
  onChangeDatabase,
  hasNextStep,
  hasInitialFocus,
  databaseIsDisabled,
  databaseDisabledTooltip,
}: DataSelectorDatabasePickerProps) => {
  const sections = useMemo(
    (): Section<Item>[] => [
      {
        items: databases.map((database, index) => ({
          name: database.name,
          index,
          database,
        })),
      },
    ],
    [databases],
  );

  if (databases.length === 0) {
    return <DataSelectorLoading />;
  }

  return (
    <AccordionList<Item>
      id="DatabasePicker"
      key="databasePicker"
      className={CS.textBrand}
      hasInitialFocus={hasInitialFocus}
      sections={sections}
      globalSearch={true}
      onChange={(item: Item) => onChangeDatabase(item.database)}
      itemIsClickable={(item: Item) => !databaseIsDisabled?.(item.database)}
      itemIsSelected={(item: Item) =>
        selectedDatabase && item.database.id === selectedDatabase.id
      }
      renderItemIcon={() => (
        <Icon
          className={cx("Icon", CS.textDefault)}
          name="database"
          size={18}
        />
      )}
      renderItemWrapper={(content: ReactNode, item: Item) => {
        const tooltip = databaseDisabledTooltip?.(item.database);
        if (tooltip) {
          return (
            <Tooltip label={tooltip} position="right">
              <div>{content}</div>
            </Tooltip>
          );
        }
        return content;
      }}
      showItemArrows={hasNextStep}
      maxHeight={Infinity}
    />
  );
};
