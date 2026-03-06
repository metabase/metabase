import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useState,
} from "react";

export interface SimulatedModel {
  name: string;
  collectionPath: string[]; // ancestor collection names, e.g. ["Analytics", "Finance"]
}

export interface SimulatedTransform {
  transformsFolderName: string; // folder name on the Transforms page
  models: SimulatedModel[];
}

interface SimulatedTransformsContextValue {
  transforms: SimulatedTransform[];
  addTransforms: (transform: SimulatedTransform) => void;
}

const SimulatedTransformsContext =
  createContext<SimulatedTransformsContextValue>({
    transforms: [],
    addTransforms: () => {},
  });

export function SimulatedTransformsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [transforms, setTransforms] = useState<SimulatedTransform[]>([]);

  const addTransforms = useCallback((transform: SimulatedTransform) => {
    setTransforms((prev) => [...prev, transform]);
  }, []);

  return (
    <SimulatedTransformsContext.Provider value={{ transforms, addTransforms }}>
      {children}
    </SimulatedTransformsContext.Provider>
  );
}

export function useSimulatedTransforms() {
  return useContext(SimulatedTransformsContext);
}
