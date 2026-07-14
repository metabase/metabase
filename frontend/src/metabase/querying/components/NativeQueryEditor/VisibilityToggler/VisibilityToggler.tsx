import cx from "classnames";
import { t } from "ttag";

import { Flex, Icon, Text } from "metabase/ui";

import VisibilityTogglerS from "./VisibilityToggler.module.css";

interface VisibilityTogglerProps {
  isOpen: boolean;
  readOnly: boolean;
  toggleEditor: () => void;
  className?: string;
  /** When true, always show the expand icon and omit the "Open Editor" label. */
  forceExpand?: boolean;
}

export const VisibilityToggler = ({
  isOpen,
  readOnly,
  toggleEditor,
  className = "",
  forceExpand = false,
}: VisibilityTogglerProps) => {
  const showExpand = forceExpand || !isOpen;
  const text = showExpand && !forceExpand ? t`Open Editor` : null;
  const icon = showExpand ? "expand" : "contract";

  return (
    <Flex
      component="a"
      align="center"
      className={cx(VisibilityTogglerS.ToggleContent, className, {
        [VisibilityTogglerS.isReadOnly]: readOnly,
      })}
      onClick={toggleEditor}
      data-testid="visibility-toggler"
      aria-label={showExpand ? t`Expand editor` : t`Collapse editor`}
      aria-hidden={readOnly}
    >
      {text && (
        <Text component="span" mr="sm" miw={70}>
          {text}
        </Text>
      )}
      <Icon name={icon} size={18} />
    </Flex>
  );
};
