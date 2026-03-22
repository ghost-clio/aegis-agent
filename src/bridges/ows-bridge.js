/**
 * OWS Bridge — Connects Aegis to the Open Wallet Standard
 * 
 * Provides wallet creation, signing, and policy enforcement
 * through OWS's local-first secure vault.
 */

import { createWallet, signMessage, signTransaction } from '@open-wallet-standard/core';

export class OWSBridge {
  constructor(walletName = 'aegis-treasury') {
    this.walletName = walletName;
    this.wallet = null;
    this.initialized = false;
  }

  /**
   * Initialize or load the wallet vault
   */
  async initialize() {
    try {
      this.wallet = createWallet(this.walletName);
      this.initialized = true;
      return {
        success: true,
        walletName: this.walletName,
        accounts: this.wallet,
      };
    } catch (error) {
      // Wallet may already exist — that's fine
      if (error.message?.includes('already exists')) {
        this.initialized = true;
        return { success: true, walletName: this.walletName, existing: true };
      }
      throw error;
    }
  }

  /**
   * Sign a message (used for authentication, off-chain proofs)
   */
  async sign(chain, message) {
    if (!this.initialized) throw new Error('OWS bridge not initialized');
    return signMessage(this.walletName, chain, message);
  }

  /**
   * Sign a transaction (goes through OWS policy engine first)
   */
  async signTx(chain, txHex) {
    if (!this.initialized) throw new Error('OWS bridge not initialized');
    return signTransaction(this.walletName, chain, txHex);
  }

  /**
   * Get wallet info and addresses for all chains
   */
  getWalletInfo() {
    return {
      name: this.walletName,
      initialized: this.initialized,
      vault: '~/.ows/wallets/',
      encryption: 'AES-256-GCM',
      keyIsolation: 'subprocess',
    };
  }
}

/**
 * OWS Policy Configuration for Aegis
 * These are the OWS-native policies (separate from Aegis strategy policies)
 */
export function createAegisOWSPolicies(config = {}) {
  return {
    // Per-API-key policies for agent access
    agent: {
      maxTransactionValue: config.maxTxValue || '0.5', // ETH
      allowedChains: config.chains || ['eip155:1', 'eip155:8453'],
      requireSimulation: config.simulate !== false,
      allowedRecipients: config.recipients || [], // empty = any
      rateLimit: {
        maxPerMinute: config.rateLimit || 5,
        maxPerHour: config.rateLimit ? config.rateLimit * 30 : 60,
      },
    },
    // Owner bypasses all policies
    owner: {
      bypass: true,
    },
  };
}
