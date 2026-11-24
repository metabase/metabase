import type { JSONContent } from "@tiptap/core";
import type { Node as PmNode } from "@tiptap/pm/model";
import { P, match } from "ts-pattern";

import {
  type Token,
  type TokenStages,
  isCloseToken,
  isConnectorToken,
  isOpenToken,
  isPillToken,
} from "../model/types";
import { closeToken, connectorToken, join, openToken } from "../model/utils";

import {
  connectorContent,
  getPillId,
  isAndNode,
  isCloseNode,
  isOpenNode,
  isOrNode,
  isPillNode,
  isThenNode,
  parenContent,
  pillContent,
  thenContent,
} from "./nodes";
import { type PillRegistry, registerPill } from "./pill-registry";

export type DocumentToken<F> = { token: Token<F>; pos: number };

const tokenToNode = <F>(
  token: Token<F>,
  stage: number,
  registry: PillRegistry<F>,
): JSONContent =>
  match(token)
    .with(P.when(isPillToken), (pill) =>
      pillContent(registerPill(registry, pill), stage),
    )
    .with(P.when(isConnectorToken), ({ type }) => connectorContent(type))
    .with(P.when(isOpenToken), () => parenContent("open"))
    .with(P.when(isCloseToken), () => parenContent("close"))
    .exhaustive();

export const tokensToContent = <F>(
  stages: TokenStages<F>,
  registry: PillRegistry<F>,
): JSONContent => ({
  type: "doc",
  content: [
    {
      type: "paragraph",
      content: join(
        stages.map((tokens, stage) =>
          tokens.map((token) => tokenToNode(token, stage, registry)),
        ),
        thenContent,
      ),
    },
  ],
});

const nodeToToken = <F>(
  node: PmNode,
  registry: PillRegistry<F>,
): Token<F> | null =>
  match(node)
    .with(P.when(isPillNode), () => registry.get(getPillId(node)) ?? null)
    .with(P.when(isAndNode), () => connectorToken("and"))
    .with(P.when(isOrNode), () => connectorToken("or"))
    .with(P.when(isOpenNode), () => openToken())
    .with(P.when(isCloseNode), () => closeToken())
    .otherwise(() => null);

export const documentToTokensWithPositions = <F>(
  doc: PmNode,
  registry: PillRegistry<F>,
): DocumentToken<F>[][] => {
  const stages: DocumentToken<F>[][] = [[]];
  doc.descendants((node, pos) => {
    const token = nodeToToken(node, registry);
    if (isThenNode(node)) {
      stages.push([]);
    } else if (token) {
      stages.at(-1)?.push({ token, pos });
    }
  });
  return stages;
};

export const documentToTokens = <F>(
  doc: PmNode,
  registry: PillRegistry<F>,
): TokenStages<F> =>
  documentToTokensWithPositions(doc, registry).map((items) =>
    items.map(({ token }) => token),
  );
