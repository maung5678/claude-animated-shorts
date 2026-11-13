import React from "react";
import { Composition } from "remotion";
import { BridgeShort, BRIDGE_FRAMES } from "./videos/bridge/Bridge";
import { WalkieShort, WALKIE_FRAMES } from "./videos/walkie/Bridge";
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="BridgeShort" component={BridgeShort} durationInFrames={BRIDGE_FRAMES} fps={30} width={1080} height={1920} />
    <Composition id="WalkieShort" component={WalkieShort} durationInFrames={WALKIE_FRAMES} fps={30} width={1080} height={1920} />
  </>
);
