import { P, match } from "ts-pattern";
import { t } from "ttag";

import {
  type Token,
  isAndToken,
  isCloseToken,
  isOpenToken,
  isOrToken,
  isPillToken,
  isThenToken,
} from "../../model/types";
import type { FilterBarStageAdapter } from "../../types";
import { Connector } from "../Connector/Connector";
import { FilterPill } from "../FilterPill/FilterPill";
import { StageSeparator } from "../StageSeparator/StageSeparator";

type FilterBarTokenProps<F> = {
  token: Token<F>;
  stageAdapter: FilterBarStageAdapter<F>;
};

export const FilterBarToken = <F,>({
  token,
  stageAdapter,
}: FilterBarTokenProps<F>) =>
  match(token)
    .with(P.when(isPillToken), ({ content }) => (
      <FilterPill content={content} formatValues={stageAdapter.formatValues} />
    ))
    .with(P.when(isAndToken), () => <Connector label={t`and`} />)
    .with(P.when(isOrToken), () => <Connector label={t`or`} />)
    .with(P.when(isThenToken), () => <StageSeparator />)
    .with(P.when(isOpenToken), () => <Connector label="(" isParen />)
    .with(P.when(isCloseToken), () => <Connector label=")" isParen />)
    .exhaustive();
