'use strict';

/**
 * electron-builder "afterPack" hook.
 *
 * We don't have an Apple Developer certificate, so CI builds with
 * CSC_IDENTITY_AUTO_DISCOVERY=false and electron-builder skips code signing
 * entirely. On Apple Silicon, macOS requires every executable to carry at
 * least an ad-hoc signature to pass Gatekeeper's structural validation —
 * without one, a quarantined download (e.g. from Chrome) is flagged as
 * "FLUX Studio is damaged and can't be opened" instead of the older, less
 * scary "unidentified developer" warning.
 *
 * Ad-hoc signing here (`codesign --sign -`) doesn't require a certificate
 * and isn't full notarization, but it gives the app bundle a valid
 * signature so Gatekeeper stops treating it as corrupted. Users may still
 * see an "unidentified developer" prompt the first time they open it —
 * that's normal and solved with right-click > Open, or System Settings >
 * Privacy & Security > Open Anyway.
 */
module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const { execFileSync } = require('child_process');
  const path = require('path');

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPack] Ad-hoc signing ${appPath} so Gatekeeper doesn't flag it as "damaged"...`);

  try {
    execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
    console.log('[afterPack] Ad-hoc signing complete.');
  } catch (err) {
    console.error('[afterPack] Ad-hoc signing failed:', err.message);
    throw err;
  }
};
