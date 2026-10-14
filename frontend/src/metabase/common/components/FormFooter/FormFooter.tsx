import cx from "classnames";

import {
  Group,
  type GroupProps,
  Modal,
  type ModalFooterProps,
  useIsInModal,
} from "metabase/ui";

type FormFooterProps = ModalFooterProps & {
  /** Applied only outside a modal, where the footer is a right-aligned row. */
  pageProps?: GroupProps;
};

/** A form's button row: `Modal.Footer` inside a `Modal`, otherwise a right-aligned row */
export const FormFooter = ({
  pageProps,
  className,
  ...props
}: FormFooterProps) => {
  const isInModal = useIsInModal();

  if (isInModal) {
    return <Modal.Footer className={className} {...props} />;
  }

  const { className: pageClassName, ...pageGroupProps } = pageProps ?? {};

  return (
    <Group
      align="center"
      justify="right"
      gap="sm"
      className={cx(className, pageClassName)}
      {...pageGroupProps}
      {...props}
    />
  );
};
