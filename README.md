# DesktopMessenger

## What is it?
DesktopMessenger is a desktop client for the Facebook Messenger platform. It works by emulating the browser and using the exact same GET/POST requests to trick Facebook into thinking we are accessing the website normally[*](https://github.com/Schmavery/facebook-chat-api).

DesktopMessenger is currently beta software so expect bugs and incomplete functionality. Feel free to report bugs/suggestions here on GitHub.

*Disclaimer*: We are not resposible for anything that happens to your account, e.g. account getting banned. DesktopMessenger does not store your password at all so any security problems will be unrelated to us or our software.

![](https://thumbs.gfycat.com/HeavyColdAttwatersprairiechicken-mobile.mp4)

## Install
To install, simply download the ZIP file (DesktopMessenger.zip) from [releases](https://github.com/mangopearapples/DesktopMessenger/releases) and run DesktopMessenger.exe after you extract the ZIP file. 
The executable will prompt may prompt you to download an update which will download the latest version of the app.
This is not an installer so please place it in an appropriate location and do not delete.

## Updating
Everytime DesktopMessenger is launched, it will check for updates and prompt you to update if there is an update available. 
You can turn this off in the settings (coming soon).

## Uninstall
Simply delete every file and folder extracted from the ZIP file. 
All program files are created and stored local to the program.

## Known Bugs
* Accounts with 2-factor authentication will not be able to log in. 
  Please disable 2FA, log in with DesktopMessenger, then re-enable 2FA if you wish to do so.
  You will stay logged in if you do not log out of DesktopMessenger.
* ~~Placing the application in a location where the user has no read/write permissions (e.g. Program Files) will cause the application to crash (i.e. stop working and display an error message). This can be fixed by running the application with elevated control (i.e. Run as Admin) or simply placing the application folder in a location where the user has read/write permissions (e.g. Documents).~~ (Fixed in 0.2.1)

## Install Without Install Package
If you want to use this application without using the ZIP file, follow:

   1. Download Electron from http://electron.atom.io/
   2. Download the version of DesktopMessenger you want from /release/app/
   3. Rename the downloaded `DesktopMesseger.asar` to `app.asar`
   3. Place downloaded app in the {Root of Electron}/resources/.
   4. To run, double click or run electron.exe.

## Credits
DesktopMessenger could only be made possible with:

   * [Facebook-Chat-Api by Schmavery](https://github.com/Schmavery/facebook-chat-api)
   * [Electron](http://electron.atom.io/)
   * [Google's Material Design Icons](https://material.io/icons/)
