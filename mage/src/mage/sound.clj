(ns mage.sound
  "Cross-platform sound effects for mage tasks.

  Plays notification sounds on macOS (afplay) and Linux (paplay/aplay).
  Sounds are automatically disabled in CI environments or when MAGE_VOLUME is set to 0.

  ## Volume Control

  Set the MAGE_VOLUME environment variable to control volume (0-100, default: 25).
  - MAGE_VOLUME=0 disables sound
  - MAGE_VOLUME=50 plays at 50% volume
  - MAGE_VOLUME=100 plays at full volume
  - CI=1 also disables sound (no need to scare someone in a datacenter)

  ## Available Sounds

  All sound files are in OGG Vorbis format (CC0/public domain) in mage/resources/sounds/:

  - success.ogg - Bright ascending tone with harmonics (C major, 0.2s)
  - error.ogg - Harsh descending buzz with dissonance (400→200 Hz, 0.15s)
  - warning.ogg - Double beep with overtones (800 Hz + harmonic, 0.28s)
  - ping.ogg - Crisp high tone with overtone (1200/2400 Hz, 0.12s)

  ## Usage

  (require '[mage.sound :as sound])

  ;; Convenience functions
  (sound/success)
  (sound/error)
  (sound/warning)
  (sound/ping)"
  (:require
   [babashka.fs :as fs]
   [babashka.process :as process]
   [mage.util :as u]))

(set! *warn-on-reflection* true)

(defn- get-volume
  "Get volume level from MAGE_VOLUME env var (0-100, default 25)."
  []
  (let [volume-str (u/env "MAGE_VOLUME" (constantly nil))]
    (if volume-str
      (try
        (let [v (Integer/parseInt volume-str)]
          (max 0 (min 100 v)))
        (catch Exception _
          25))
      25)))

(defn- sound-disabled?
  "Check if sounds should be disabled based on environment variables."
  []
  (or (u/env "CI" (constantly nil))
      (zero? (get-volume))))

(defn- get-os
  "Detect the operating system."
  []
  (let [os-name (System/getProperty "os.name")]
    (cond
      (re-find #"(?i)mac|darwin" os-name) :macos
      (re-find #"(?i)linux" os-name) :linux
      :else :unknown)))

(defn- get-sound-command
  "Get the available sound command for the current OS."
  []
  (binding [u/*skip-warning* true]
    (case (get-os)
      :macos (when (u/can-run? "afplay") :afplay)
      :linux (cond
               (u/can-run? "paplay") :paplay
               (u/can-run? "aplay") :aplay
               :else nil)
      nil)))

(defn- sound-path
  "Get the path to a bundled sound file."
  [sound-name]
  (let [sound-file (str sound-name ".ogg")
        sound-path (str u/project-root-directory "/mage/resources/sounds/" sound-file)]
    (when (fs/exists? sound-path)
      sound-path)))

(defn- play-sound
  "Play a sound file using the appropriate command for the OS with volume control.
  Returns a future that completes when the sound finishes playing."
  [sound-path sound-cmd volume]
  (if (and sound-path (fs/exists? sound-path))
    (future
      (try
        (let [cmd (case sound-cmd
                    ;; macOS afplay uses -v with 0.0-1.0 range
                    :afplay (str "afplay -v " (/ volume 100.0) " " sound-path)
                    ;; Linux paplay uses --volume with 0-65536 range (65536 = 100%)
                    :paplay (str "paplay --volume=" (int (* volume 655.36)) " " sound-path)
                    ;; aplay doesn't have built-in volume control
                    :aplay (str "aplay -q " sound-path)
                    nil)]
          (when cmd
            (process/shell {:out :string :err :string :continue true} cmd)))
        (catch Exception _
          ;; Silently ignore sound playback errors
          nil)))
    ;; Return a completed future if sound is disabled/missing
    (future nil)))

(defn- play
  "Play a sound effect by name. Accepts keywords or strings.
  Returns a future that completes when the sound finishes playing.

  Volume is controlled by MAGE_VOLUME environment variable (0-100, default 25).
  Sounds are disabled when MAGE_VOLUME=0 or CI environment variable is set.

  Looks for .ogg files in mage/resources/sounds/.

  Common sound names:
    - :success
    - :error
    - :warning
    - :ping

  Examples:
    (play :success)
    (play \"error\")
    (play :warning)"
  ([sound-name]
   (play sound-name (get-volume)))
  ([sound-name volume]
   (if-not (sound-disabled?)
     (if-let [sound-cmd (get-sound-command)]
       (let [sound-str (cond-> sound-name (keyword? sound-name) name)
             path (sound-path sound-str)]
         (play-sound path sound-cmd volume))
       ;; No sound command available
       (future nil))
     ;; Sound is disabled
     (future nil))))

(defn success
  "Play a success sound. Returns a future that completes when the sound finishes."
  []
  (play :success))

(defn error
  "Play an error sound. Returns a future that completes when the sound finishes."
  []
  (play :error))

(defn warning
  "Play a warning sound. Returns a future that completes when the sound finishes."
  []
  (play :warning))

(defn ping
  "Play a ping sound. Returns a future that completes when the sound finishes."
  []
  (play :ping))

(comment

  ;; to regenerate, from mage/resources/sounds, run:
  ;; These sounds are CC0 / public domain, created with ffmpeg sine waves, and are small: under 6KB each.
  ;; ffmpeg -f lavfi -i "sine=f=900:d=0.10" -f lavfi -i "sine=f=1400:d=0.16" -f lavfi -i "sine=f=1800:d=0.06" -filter_complex "[0]volume=2.4[a];[1]adelay=120|120,volume=2.7[b];[2]adelay=240|240,volume=2.9[c];[a][b][c]amix=inputs=3,alimiter=limit=0.96,afade=t=in:d=0.005,afade=t=out:st=0.23:d=0.05" -c:a libvorbis -q:a 5 success.ogg -y
  ;; ffmpeg -f lavfi -i "sine=f=200:d=0.15" -f lavfi -i "sine=f=400:d=0.15" -f lavfi -i "sine=f=200:d=0.15" -filter_complex "[0]volume=3.3[a];[1]volume=1.8[b];[2]volume=2.6[c];[a][b][c]amix=inputs=3,alimiter=limit=0.93,afade=t=in:d=0.01,afade=t=out:st=0.4:d=0.05" -c:a libvorbis -q:a 5 error.ogg -y
  ;; ffmpeg -f lavfi -i "sine=f=400:d=0.10" -f lavfi -i "sine=f=550:d=0.10" -filter_complex "[0]volume=3.0,afade=t=in:d=0.005,afade=t=out:st=0.08:d=0.02[a];[1]adelay=150|150,volume=2.4,afade=t=in:d=0.005,afade=t=out:st=0.08:d=0.02[b];[a][b]amix=inputs=2,alimiter=limit=0.9" -c:a libvorbis -q:a 5 warning.ogg -y
  ;; ffmpeg -f lavfi -i "sine=f=700:d=0.07" -filter_complex "volume=2.6,alimiter=limit=0.9,afade=t=in:d=0.005,afade=t=out:st=0.05:d=0.02" -c:a libvorbis -q:a 5 ping.ogg -y

  (with-redefs [get-volume (fn [] 100)]
    (success)
    (Thread/sleep 300)
    (error)
    (Thread/sleep 300)
    (warning)
    (Thread/sleep 300)
    (ping))

;; Check environment
  {:sound-disabled? (sound-disabled?)
   :get-volume (get-volume)
   :get-os (get-os)
   :get-sound-command (get-sound-command)})
