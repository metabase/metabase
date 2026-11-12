import { useListGlossaryQuery } from "metabase/api";

import { GlossaryDescription } from "./GlossaryDescription";
import { GlossaryTable } from "./GlossaryTable";
import {
  type UseGlossaryMutationsOptions,
  useGlossaryMutations,
} from "./use-glossary-mutations";

type GlossaryProps = UseGlossaryMutationsOptions;

/** The glossary description and table wired to the API; the callbacks report each saved change. */
export function Glossary(props: GlossaryProps) {
  const { data } = useListGlossaryQuery();
  const glossary = data?.data ?? [];
  const canWrite = data?.can_write ?? false;
  const { createTerm, updateTerm, deleteTerm } = useGlossaryMutations(props);

  return (
    <>
      <GlossaryDescription mb="lg" />
      <GlossaryTable
        glossary={glossary}
        readOnly={!canWrite}
        onCreate={createTerm}
        onEdit={updateTerm}
        onDelete={deleteTerm}
      />
    </>
  );
}
