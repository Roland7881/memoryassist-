const { app, BrowserWindow, screen, ipcMain } = require('electron');
const path = require('path');

let win;

app.whenReady().then(() => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize;

    win = new BrowserWindow({
        width:  320,
        height: 180,
        x: width - 340,   // default: bottom-right corner
        y: height - 200,
        frame:       false,
        transparent: true,
        alwaysOnTop: true,
        resizable:   true,
        skipTaskbar: true,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false,
        },
    });

    win.setAlwaysOnTop(true, 'screen-saver'); // stays above fullscreen apps
    win.setIgnoreMouseEvents(true, { forward: true }); // click-through by default
    win.loadFile(path.join(__dirname, 'overlay.html'));
});

// Toggle click-through: when hovered over interactive elements, disable it
ipcMain.on('set-ignore-mouse', (_, ignore) => {
    win.setIgnoreMouseEvents(ignore, { forward: true });
});

// Let the overlay drag itself
ipcMain.on('move', (_, { dx, dy }) => {
    const [x, y] = win.getPosition();
    win.setPosition(x + dx, y + dy);
});

ipcMain.on('quit', () => app.quit());

app.on('window-all-closed', () => app.quit());
