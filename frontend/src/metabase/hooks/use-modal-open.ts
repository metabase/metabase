import { useEffect, useState } from "react";

export function useModalOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setOpen(true);
    });
  }, []);

  return { open };
}