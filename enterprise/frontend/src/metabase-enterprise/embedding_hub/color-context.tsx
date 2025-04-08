import type { ReactNode } from "react";
import { createContext, useContext, useState } from "react";

export type ColorScheme = "white" | "light-gray";

interface ColorContextType {
  cardBackground: ColorScheme;
  sideNavBackground: ColorScheme;
  mainBackground: ColorScheme;
  setCardBackground: (color: ColorScheme) => void;
  setSideNavBackground: (color: ColorScheme) => void;
  setMainBackground: (color: ColorScheme) => void;
}

const ColorContext = createContext<ColorContextType | undefined>(undefined);

export function ColorProvider({ children }: { children: ReactNode }) {
  const [cardBackground, setCardBackground] = useState<ColorScheme>("light-gray");
  const [sideNavBackground, setSideNavBackground] = useState<ColorScheme>("light-gray");
  const [mainBackground, setMainBackground] = useState<ColorScheme>("white");

  return (
    <ColorContext.Provider
      value={{
        cardBackground,
        sideNavBackground,
        mainBackground,
        setCardBackground,
        setSideNavBackground,
        setMainBackground
      }}
    >
      {children}
    </ColorContext.Provider>
  );
}

export function useColors() {
  const context = useContext(ColorContext);
  if (context === undefined) {
    throw new Error("useColors must be used within a ColorProvider");
  }
  return context;
}
