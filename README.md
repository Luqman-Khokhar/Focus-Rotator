# Focus-Rotator

Floating always-on-top timer that rotates focus across your Chrome profiles, VS Code windows and any other app window, so you remember your other projects without watching the clock.

- Set one interval (minutes). Every interval the next target is raised, round-robin.
- Targets: any open window (picked from `wmctrl -l`), a Chrome profile, or a VS Code folder.
- Tray icon: Show/edit, Start/Pause/Resume, Switch now, Stop, Quit. Closing the window hides it to the tray.

## Requirements
Linux on X11 (Cinnamon/Xfce/GNOME-on-Xorg), `wmctrl`, Node 22+. Wayland blocks window raising.

## Run
```
npm install
npm start
npm test
```
