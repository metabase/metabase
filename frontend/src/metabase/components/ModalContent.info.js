import React from "react";
import ModalContent from "metabase/components/ModalContent";
import Button from "metabase/components/Button";

export const component = ModalContent;

export const description = `
A standard modal content layout, including header with title and close button, body, and footer.
`;

const Modal = ({ children }) => (
  <div className="rounded bordered">{children}</div>
);

export const examples = {
  default: (
    <Modal>
      <ModalContent
        title="Do something crazy?"
        onClose={() => alert("close!")}
        footer={[<Button danger>Ok</Button>]}
      >
        Are you sure?
      </ModalContent>
    </Modal>
  ),
};
