import { useState } from "react";
import { t } from "ttag";

import { Button } from "metabase/ui";

import { InputTranslationEditorModal } from "./Modal";

export const ModalLauncher = () => {
  const [showModal, setShowModal] = useState(false);
  return (
    <>
      <Button
        onClick={() => {
          setShowModal(true);
        }}
      >
        {t`Open dictionary`}
      </Button>
      {showModal && (
        <InputTranslationEditorModal
          opened={true}
          closeModal={() => setShowModal(false)}
          // HACK: Hard coded initial target
          initialTarget={{
            id: 46,
            name: "Lions (es:Leones,fr:Lions)",
            type: "dashboard",
          }}
          showTargetSwitcher
        />
      )}
    </>
  );
};
