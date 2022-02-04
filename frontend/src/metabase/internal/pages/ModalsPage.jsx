/* eslint-disable react/prop-types */
import React from "react";

import ConfirmContent from "metabase/components/ConfirmContent";
import ModalContent from "metabase/components/ModalContent";
import DeleteModalWithConfirm from "metabase/components/DeleteModalWithConfirm";
import { PageHeader, PageSection } from "./ModalsPage.styled";

const Section = ({ children }) => (
  <PageSection className="bordered shadowed rounded">{children}</PageSection>
);

const ModalsPage = () => (
  <div className="wrapper">
    <PageHeader>
      <h1>Modal Content examples</h1>
    </PageHeader>
    <h3>Modal Content</h3>
    <p>Basic modal content. Build off of this for other modals.</p>
    <Section>
      <ModalContent
        title="Some modal stuff"
        onClose={() => alert("Close")}
        onAction={() => alert("Action!")}
      >
        Stuff here?
      </ModalContent>
    </Section>
    <h3>Confirm Content</h3>
    <p>Use when asking someone to confirm a destructive action</p>
    <Section>
      <ConfirmContent title="Delete this for sure?" />
    </Section>

    <h3>Delete Modal with confirm</h3>
    <p>
      If you need someone to Use when asking someone to confirm a destructive
      action
    </p>
    <Section>
      <DeleteModalWithConfirm
        title={"This will be deleted"}
        confirmItems={[
          <span key="0">
            This will happen, please be sure you know about it
          </span>,
        ]}
      />
    </Section>
  </div>
);

export default ModalsPage;
