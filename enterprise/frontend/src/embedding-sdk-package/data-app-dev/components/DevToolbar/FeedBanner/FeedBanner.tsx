/* eslint-disable i18next/no-literal-string */
import type { DiagnosticsFeedProblem } from "../../../lib/use-diagnostics-feed";
import S from "../DevToolbar.module.css";

interface Props {
  problem: DiagnosticsFeedProblem | null;
  loaded: boolean;
  clients: number;
}

export const FeedBanner = ({ problem, loaded, clients }: Props) => {
  if (problem?.kind === "unreachable") {
    return (
      <div className={S.Problem}>
        Can&apos;t reach the dev server, so this is not up to date. Is `npm run
        dev` still running?
      </div>
    );
  }

  if (problem?.kind === "http") {
    return (
      <div className={S.Problem}>
        The dev server answered {problem.status} for the diagnostics feed, so
        this is not up to date.
      </div>
    );
  }

  if (loaded && clients === 0) {
    return (
      <div className={S.Note}>
        No preview tab is connected, so nothing has been captured yet.
      </div>
    );
  }

  return null;
};
