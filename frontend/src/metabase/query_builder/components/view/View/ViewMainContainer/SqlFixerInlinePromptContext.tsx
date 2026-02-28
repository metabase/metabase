import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { useDispatch } from "metabase/lib/redux";
import { setIsNativeEditorOpen } from "metabase/query_builder/actions";

type PromptFn = (prompt: string) => Promise<void>;

interface SqlFixerInlinePromptContextValue {
  isLoading: boolean;
  requestSqlFixPrompt: PromptFn | null;
  register: (cb: PromptFn) => VoidFunction;
}

interface SqlFixerInlinePromptProviderProps {
  children: ReactNode;
}

const SqlFixerInlinePromptContext =
  createContext<SqlFixerInlinePromptContextValue>({
    isLoading: false,
    requestSqlFixPrompt: null,
    register: () => () => {},
  });

export const SqlFixerInlinePromptProvider = ({
  children,
}: SqlFixerInlinePromptProviderProps) => {
  const [requestFix, setRequestFix] = useState<PromptFn | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const dispatch = useDispatch();

  const register = useCallback((rf: PromptFn) => {
    setRequestFix(() => rf);
    return () => {
      setRequestFix(null);
    };
  }, []);

  const requestSqlFixPrompt = useCallback(
    async (prompt: string) => {
      if (!requestFix) {
        throw new Error("No registered callback");
      }
      setIsLoading(true);
      try {
        await dispatch(setIsNativeEditorOpen(true));
        await requestFix(prompt);
      } finally {
        setIsLoading(false);
      }
    },
    [dispatch, requestFix],
  );

  return (
    <SqlFixerInlinePromptContext.Provider
      value={{
        requestSqlFixPrompt: !requestFix ? null : requestSqlFixPrompt,
        register,
        isLoading,
      }}
    >
      {children}
    </SqlFixerInlinePromptContext.Provider>
  );
};

export function useSqlFixerInlinePrompt() {
  return useContext(SqlFixerInlinePromptContext);
}

export const useRegisterSqlFixerInlineContextProvider = (
  providerFn: PromptFn,
  dependencies: React.DependencyList = [],
) => {
  const { register } = useSqlFixerInlinePrompt();

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const cachedProviderFn = useMemo(() => providerFn, dependencies);

  useEffect(() => {
    const deregister = register(cachedProviderFn);
    return () => deregister();
  }, [cachedProviderFn, register]);
};
