import React, { useState } from "react";

import Modal from "metabase/components/Modal";

import DataAppScaffoldingModal from "./DataAppScaffoldingModal";
import DataAppEducationModal from "./DataAppEducationModal";

interface Props {
  onClose: () => void;
}

function CreateDataAppModal({ onClose }: Props) {
  const [modal, setModal] = useState<"education" | "scaffolding">("education");

  if (modal === "education") {
    return (
      <Modal small onClose={onClose}>
        <DataAppEducationModal
          onNextStep={() => setModal("scaffolding")}
          onClose={onClose}
        />
      </Modal>
    );
  }

  return (
    <Modal medium onClose={onClose}>
      <DataAppScaffoldingModal onClose={onClose} />
    </Modal>
  );
}

export default CreateDataAppModal;
