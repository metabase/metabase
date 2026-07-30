import {
  ParameterValueWidget,
  type ParameterValueWidgetProps,
} from "metabase/parameters/components/ParameterValueWidget";
import { Box, type BoxProps } from "metabase/ui";

import S from "./TagEditorParam.module.css";

type BoxPropsWithChildren = BoxProps & { children: React.ReactNode };
interface ContainerLabelProps extends BoxPropsWithChildren {
  id?: string | undefined;
}

const ContainerLabel = ({ children, ...props }: ContainerLabelProps) => {
  return (
    <Box className={S.ContainerLabel} {...props}>
      {children}
    </Box>
  );
};

const InputContainer = ({ children, ...props }: BoxPropsWithChildren) => {
  return (
    <Box display="block" component="label" pb="xl" {...props}>
      {children}
    </Box>
  );
};

const ErrorSpan = ({ children, ...props }: BoxPropsWithChildren) => {
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
