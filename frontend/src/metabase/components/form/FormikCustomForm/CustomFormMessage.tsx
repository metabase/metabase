import FormMessage from "metabase/components/form/FormMessage";

import { useForm } from "./context";

export interface CustomFormMessageProps {
  className?: string;
  noPadding?: boolean;
}

/**
 * @deprecated
 */
function CustomFormMessage(props: CustomFormMessageProps) {
  const { error } = useForm();
  if (error) {
    return <FormMessage {...props} message={error} />;
  }
  return null;
}

// eslint-disable-next-line import/no-default-export -- deprecated usage
export default CustomFormMessage;
