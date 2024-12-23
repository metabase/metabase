import {
  ParameterValueWidget,
  type ParameterValueWidgetProps,
} from "metabase/parameters/components/ParameterValueWidget";
import { Box, type BoxProps } from "metabase/ui";

import S from "./TagEditorParam.module.css";

interface ContainerLabelProps extends BoxProps {
  paddingTop?: boolean;
  id?: string | undefined;
}

const ContainerLabel = ({
  paddingTop,
  children,
  ...props
}: ContainerLabelProps) => {
  return (
    <Box className={S.ContainerLabel} pt={paddingTop ? "sm" : 0} {...props}>
      {children}
    </Box>
  );
};

const InputContainer = ({ children, ...props }: BoxProps) => {
  return (
    <Box display="block" component="label" pb="xl" {...props}>
      {children}
    </Box>
  );
};

const ErrorSpan = ({ children, ...props }: BoxProps) => {
  return (
    <Box component="span" className={S.ErrorSpan} {...props}>
      {children}
    </Box>
  );
};

const DefaultParameterValueWidget = (props: ParameterValueWidgetProps) => {
  return (
    <ParameterValueWidget
      className={S.DefaultParameterValueWidget}
      {...props}
    />
  );
};

export {
  ContainerLabel,
  InputContainer,
  DefaultParameterValueWidget,
  ErrorSpan,
};
