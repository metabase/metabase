import React from "react";
import { SceneImage, SceneRoot } from "./AuthScene.styled";

export interface AuthSceneProps {
  showAuthScene?: boolean;
}

const AuthScene = ({ showAuthScene }: AuthSceneProps): JSX.Element | null => {
  if (!showAuthScene) {
    return null;
  }

  return (
    <SceneRoot>
      <SceneImage
        src="/app/img/bridge.png"
        srcSet="/app/img/bridge.png 1x, /app/img/bridge@2x.png 2x, /app/img/bridge@3x.png 3x"
      />
    </SceneRoot>
  );
};

export default AuthScene;
