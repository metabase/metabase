import S from "./Onboarding.module.css";

interface VideoTutorialProps {
  id: string;
  si: string;
  title: string;
}

export const VideoTutorial = ({ id, si, title }: VideoTutorialProps) => (
  <iframe
    allowFullScreen
    className={S.video}
    loading="lazy"
    src={`https://www.youtube.com/embed/${id}?si=${si}&rel=0&enablejsapi=1`}
    title={title}
  />
);
