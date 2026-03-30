import { useEffect, useState } from "react";
import { t } from "ttag";

import { Box, Button, Flex, Modal, Text } from "metabase/ui";

import {
  MetabotFrame,
  MetabotImage,
  type MetabotVariant,
  isMetabotVariant,
  metabots,
} from "./MetabotFrame";
import Styles from "./MetabotStore.module.css";

function MoneyBagAnimation({ isActive }: { isActive: boolean }) {
  if (!isActive) {
    return null;
  }

  const moneyBags = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    delay: i * 0.05,
    duration: 1.5 + Math.random() * 0.5,
    startX: `${30 + Math.random() * 40}%`,
    endX: `${-30 + Math.random() * 160}vw`,
    midX: `${-10 + Math.random() * 80}vw`,
    startY: `${30 + Math.random() * 40}%`,
    endY: `${-60 - Math.random() * 40}vh`,
    midY: `${-20 - Math.random() * 30}vh`,
    rotation: `${-360 - Math.random() * 360}deg`,
  }));

  return (
    <div className={Styles.moneyBagContainer}>
      {moneyBags.map((bag) => (
        <div
          key={bag.id}
          className={Styles.moneyBag}
          style={
            {
              "--delay": `${bag.delay}s`,
              "--duration": `${bag.duration}s`,
              "--start-x": bag.startX,
              "--end-x": bag.endX,
              "--mid-x": bag.midX,
              "--start-y": bag.startY,
              "--end-y": bag.endY,
              "--mid-y": bag.midY,
              "--rotation": bag.rotation,
            } as React.CSSProperties
          }
        >
          💰
        </div>
      ))}
    </div>
  );
}

export function MetabotStore() {
  const [isOpen, setIsOpen] = useState(false);
  const [myMetabot, setMyMetabot] = useState<MetabotVariant>("vanilla");
  const [showMoneyBags, setShowMoneyBags] = useState(false);

  useEffect(() => {
    const storedMetabot = localStorage.getItem("myMetabot");
    if (storedMetabot != null && isMetabotVariant(storedMetabot)) {
      setMyMetabot(storedMetabot);
    }
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  if (today !== "2026-04-01") {
    return null;
  }

  return (
    <>
      <Box p="1rem">
        <Button
          className={Styles.storeButton}
          variant="light"
          size="xs"
          onClick={() => setIsOpen(true)}
          fullWidth
        >
          {t`Visit the Metabot Store`}
        </Button>
      </Box>
      <MetabotFrame variant={myMetabot} />
      <Modal
        opened={isOpen}
        onClose={() => setIsOpen(false)}
        title={
          <span className={Styles.storeModalTitle}>{t`Metabot Store`}</span>
        }
        classNames={{
          content: Styles.storeModalContent,
          header: Styles.storeModalHeader,
          body: Styles.storeModalBody,
          close: Styles.storeModalClose,
        }}
        overlayProps={{ backgroundOpacity: 0.72, blur: 12 }}
        size="60rem"
        centered
      >
        <MoneyBagAnimation isActive={showMoneyBags} />
        <div className={Styles.storeBackdrop}>
          <Text className={Styles.storeIntro}>
            {t`Everything here is unnecessary, flamboyant, and technically essential.`}
          </Text>
          <div className={Styles.storeGrid}>
            {Object.values(metabots).map((item) => (
              <div
                key={item.name}
                className={Styles.storeTile}
                data-accent="purple"
              >
                <div className={Styles.storeTileGlow} />
                <Flex h="6rem" align="end" justify="center">
                  <MetabotImage
                    variant={item.imageName as MetabotVariant}
                    bg="transparent"
                  />
                </Flex>
                <Text className={Styles.storeTileName}>{item.name}</Text>
                <Text className={Styles.storeTileDescription}>
                  {item.description}
                </Text>
                <div className={Styles.storeTileFooter}>
                  <Text className={Styles.storeTilePrice}>
                    {myMetabot !== item.imageName ? item.price : ""}
                  </Text>
                  <Button
                    size="xs"
                    variant="white"
                    className={Styles.storeTileButton}
                    disabled={myMetabot === item.imageName}
                    onClick={() => {
                      setShowMoneyBags(true);
                      setMyMetabot(item.imageName as MetabotVariant);
                      localStorage.setItem("myMetabot", item.imageName);
                      setTimeout(() => {
                        setShowMoneyBags(false);
                        setIsOpen(false);
                      }, 2000);
                    }}
                  >
                    {myMetabot === item.imageName ? t`Owned` : t`Buy now`}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}
