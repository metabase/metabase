import { t } from "ttag";

import { useRegisterShortcut } from "metabase/palette/hooks/useRegisterShortcut";
import { Icon, Switch } from "metabase/ui";

import QuestionDisplayToggleS from "./QuestionDisplayToggle.module.css";

export interface QuestionDisplayToggleProps {
  className?: string;
  isShowingRawTable: boolean;
  onToggleRawTable: (isShowingRawTable: boolean) => void;
}

const QuestionDisplayToggle = ({
  className,
  isShowingRawTable,
  onToggleRawTable,
}: QuestionDisplayToggleProps) => {
  useRegisterShortcut(
    [
      {
        id: "toggle-visualization",
        perform: () => onToggleRawTable(!isShowingRawTable),
      },
    ],
    [isShowingRawTable, onToggleRawTable],
  );

  return (
    <Switch
      checked={!isShowingRawTable}
      onChange={() => onToggleRawTable(!isShowingRawTable)}
      size="lg"
      classNames={{
        root: className,
        track: QuestionDisplayToggleS.track,
        thumb: QuestionDisplayToggleS.thumb,
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggleRawTable(!isShowingRawTable);
        }
      }}
      aria-label={
        isShowingRawTable ? t`Switch to data` : t`Switch to visualization`
      }
      thumbIcon={
        isShowingRawTable ? (
          <Icon name="table2" size={16} />
        ) : (
          <Icon size={16} name="lineandbar" />
        )
      }
      offLabel={<Icon name="lineandbar" size={16} color="grey" />}
      onLabel={<Icon size={16} name="table2" color="grey" />}
    />
  );
};

export { QuestionDisplayToggle };
