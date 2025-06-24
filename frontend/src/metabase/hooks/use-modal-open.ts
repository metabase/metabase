import { useEffect, useState } from "react";

// this is a custom hook that is used to open a modal after a delay
// so that the modal can be animated in
export function useModalOpen() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setTimeout(() => {
      setOpen(true);
    });
  }, []);

  return { open };
}
