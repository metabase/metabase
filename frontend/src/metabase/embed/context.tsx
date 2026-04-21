import { type PropsWithChildren, createContext, useContext } from "react";

import type { EntityToken, EntityUuid } from "metabase-types/api/entity";

type EmbeddingEntityContextType = {
  uuid: EntityUuid | null;
  token: EntityToken | null;
};

export const EmbeddingEntityContext = createContext<EmbeddingEntityContextType>(
  undefined as unknown as EmbeddingEntityContextType,
);

export const EmbeddingEntityContextProvider = ({
  children,
  uuid,
  token,
}: PropsWithChildren<EmbeddingEntityContextType>) => (
  <EmbeddingEntityContext.Provider value={{ uuid, token }}>
    {children}
  </EmbeddingEntityContext.Provider>
);

export const useEmbeddingEntityContext = (): EmbeddingEntityContextType => {
  return (
    useContext(EmbeddingEntityContext) ?? {
      uuid: null,
      token: null,
    }
  );
};
