import { DiscordBehaviorBase } from "./discord-behavior-base";
import util from "util";
import { Client } from "discord.js";
import { Logger, LoggerCategory } from "@bot/logger";
import { Injectable } from "injection-js";

// TODO: there's got to be a cleaner way to handle this, but this seems to make it more resilient.

/**
 * Causes this client to die when a disconnect event occurs.
 * When supervised, the process should be immediately restarted.
 */
@Injectable()
export class DieOnDisconnectBehavior extends DiscordBehaviorBase {
  constructor(
    protected readonly client: Client,
    protected readonly logger: Logger,
  ) { super(client, logger); }

  protected async register() {
    this.client.on('disconnect', (f) => {
      this.logger.trackSimpleEvent(LoggerCategory.SystemEvent, "disconnect", { reason: util.inspect(f) });
      this.logger.flush();
      process.exit(0);
    });
  }
}