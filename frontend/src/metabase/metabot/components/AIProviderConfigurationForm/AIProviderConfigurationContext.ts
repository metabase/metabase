import {
  type MutableRefObject,
  createContext,
  useContext,
  useEffect,
} from "react";

export const AIProviderConfigurationContext = createContext<{
  connectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  disconnectHandlerRef: MutableRefObject<(() => Promise<void>) | null> | null;
  isMutating: boolean;
  isConnectButtonEnabled: boolean;
  setIsConnectButtonEnabled: (enabled: boolean) => void;
  resetProvider: VoidFunction;
  handleDisconnect: VoidFunction;
  isModal: boolean;
}>({
  isMutating: false,
  connectHandlerRef: null,
  disconnectHandlerRef: null,
  isConnectButtonEnabled: false,
  setIsConnectButtonEnabled: () => {},
  resetProvider: () => {},
  handleDisconnect: () => {},
  isModal: false,
});

export function useAIProviderConfigurationContext(
  onConnect: (() => Promise<void>) | null,
  onDisconnect: (() => Promise<void>) | null = null,
) {
  const {
    connectHandlerRef,
    disconnectHandlerRef,
    isMutating,
    setIsConnectButtonEnabled,
    resetProvider,
    handleDisconnect,
    isModal,
  } = useContext(AIProviderConfigurationContext);

  useEffect(() => {
    if (!connectHandlerRef) {
      return;
    }

    connectHandlerRef.current = onConnect;
    setIsConnectButtonEnabled(!!onConnect);

    return () => {
      setIsConnectButtonEnabled(false);
      connectHandlerRef.current = null;
    };
  }, [connectHandlerRef, onConnect, setIsConnectButtonEnabled]);

  useEffect(() => {
    if (!disconnectHandlerRef) {
      return;
    }

    disconnectHandlerRef.current = onDisconnect;

    return () => {
      disconnectHandlerRef.current = null;
    };
  }, [disconnectHandlerRef, onDisconnect]);

  return { isMutating, resetProvider, handleDisconnect, isModal };
}
